import { DB_Collaborative_Grading_Servers } from "knex/types/tables";
import { ActiveCollaborativeGrader, CollaborativeGraderKind, CollaborativeGradingEpochTransition, CollaborativeGradingPingRequest, CollaborativeGradingPingResponse, CollaborativeGradingServerConfig, CollaborativeGradingServerStrategy, GradingRecords } from "./CollaborativeGradingTypes";
import { collaborativeGradingStrategy } from "./CollaborativeGrading";
import { db_createCollaborativeGradingServer, db_getCollaborativeGradingServerConfig, db_getExamInstancesForGradingServer, db_getQuestionSubmissionsForGradingServer, db_updateCollaborativeGradingServerEpoch } from "../db/db_collaborative_grading";
import { asMutable, assert, assertExists } from "../util/util";
import { ExamInstanceInfo, QuestionSubmissionRecord } from "../rest_types";
import { EXAMMA_RAY_GRADING_SERVER } from "../server";

const GRADER_IDLE_THRESHOLD = 4000; // ms

export class CollaborativeGradingServer<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind> {
  
  public readonly grading_server_pk: number;
  public readonly question_id: string;
  public readonly grader_kind: CGKind;

  // TODO: we probably don't need to keep this in memory. Active grading clients
  // don't need this, they can get by with the synchronized transitions/operations,
  // and any newly opened grading clients can request the full grading records then
  // we wait until current transitions are finished to serve them, ensuring they are
  // coordinated.
  public readonly grading_records: GradingRecords<CGKind>;

  private current_epoch: number;
  private history_starting_epoch: number;
  private db_epoch: number;
  private transitionHistory: CollaborativeGradingEpochTransition<CGKind>[] = [];

  // Invariant: transitionRecorderJob is defined if and only if transitionRecorderQueue is non-empty.
  //            i.e. while there are transitions in the queue, they are being recorded to the database async.
  private transitionRecorderQueue: CollaborativeGradingEpochTransition<CGKind>[] = [];
  private transitionRecorderJob?: Promise<void>;

  public readonly active_graders_by_client_uuid: {
    readonly [index: string]: ActiveCollaborativeGrader<CGKind>
  } = {};
  private next_active_graders_by_client_uuid: {
    [index: string]: ActiveCollaborativeGrader<CGKind>
  } = {};

  private reload_lock?: Promise<void>;

  private strategy: CollaborativeGradingServerStrategy<CGKind>;

  private static INSTANCES = new Map<number,
    | CollaborativeGradingServer
    | Promise<CollaborativeGradingServer>
    | undefined
  >();

  public static async getConfig(grading_server_pk: number) : Promise<CollaborativeGradingServerConfig | undefined> {
    return db_getCollaborativeGradingServerConfig(grading_server_pk);
  }

  public static async getExamInstanceUuids(grading_server_pk: number) : Promise<string[]> {
    return (await db_getExamInstancesForGradingServer(grading_server_pk)).map(exam_inst => exam_inst.exam_instance_uuid);
  }

  public static async getSubmissions(grading_server_pk: number) : Promise<QuestionSubmissionRecord[]> {
    return db_getQuestionSubmissionsForGradingServer(grading_server_pk);
  }

  public static async getInstance(grading_server_pk: number) {
    return this.INSTANCES.get(grading_server_pk);
  }

  public static async getOrLoadInstance(grading_server_pk: number) {
    
    const existing = this.INSTANCES.get(grading_server_pk);
    if (existing) {
      console.log(`Reusing existing collaborative grading server with pk: ${grading_server_pk}.`);
      return existing;
    }

    let config = await db_getCollaborativeGradingServerConfig(grading_server_pk);
    assert(config !== undefined, `No collaborative grading server found with pk: ${grading_server_pk}.`);

    console.log(`Loading grading server with pk: ${grading_server_pk} for question ${config.question_id}.`);

    // This immediately puts the promise in the map. We do not await here.
    // The this.loadInstance_impl() call will eventually put the real instance in the map.
    const instance_promise = this.loadInstance_impl(config);
    this.INSTANCES.set(grading_server_pk, instance_promise);
    return instance_promise;
  }
  
  private static async loadInstance_impl(config: DB_Collaborative_Grading_Servers) {

    const strategy = collaborativeGradingStrategy(config.grader_kind);
    
    const grading_records = await strategy.loadGradingRecords(config.grading_server_pk);
    
    // This puts the real instance in the map (replacing the promise created in getOrLoadInstance() above).
    const instance = new CollaborativeGradingServer(
      config.grading_server_pk,
      config.question_id,
      config.grader_kind,
      strategy,
      grading_records,
      config.epoch
    );
    this.INSTANCES.set(config.grading_server_pk, instance);
    return instance;
  }

  public static async createNewServer<CGKind extends CollaborativeGraderKind = CollaborativeGraderKind>(question_id: string, grader_kind: CGKind) {
    const config = assertExists(await db_createCollaborativeGradingServer(question_id, grader_kind));
    return config;
  }

  private constructor(
    grading_server_pk: number,
    question_id: string,
    grader_kind: CGKind,
    strategy: CollaborativeGradingServerStrategy<CGKind>,
    grading_record: GradingRecords<CGKind>,
    epoch: number
  ) {
    
    this.grading_server_pk = grading_server_pk;
    this.question_id = question_id;
    this.grader_kind = grader_kind;
    this.strategy = strategy;
    
    this.grading_records = grading_record;
    this.current_epoch = epoch;
    this.history_starting_epoch = epoch;
    this.db_epoch = epoch;
    
    setInterval(() => {
      // Periodically clear out idle graders
      asMutable(this).active_graders_by_client_uuid = this.next_active_graders_by_client_uuid;
      this.next_active_graders_by_client_uuid = {};
    }, GRADER_IDLE_THRESHOLD);
  }

  public getConfig() : CollaborativeGradingServerConfig {
    return {
      grading_server_pk: this.grading_server_pk,
      question_id: this.question_id,
      grader_kind: this.grader_kind,
      epoch: this.current_epoch
    };
  }

  private receiveTransition(transition: CollaborativeGradingEpochTransition<CGKind>) {

    // all at once, synchronous transition to next epoch
    // so that clients won't ever get info halfway through
    // an epoch
    transition.ops.map(op => this.strategy.applyOperation(this.grading_records, op, transition.client_uuid));
    ++this.current_epoch;

    this.transitionHistory.push(transition);
    if (this.transitionHistory.length > 100) {
      this.transitionHistory.shift();
      ++this.history_starting_epoch;
    }

    // Add transitions to the queue to be recorded to the database.
    // The order of the transitions/operations is preserved and will
    // match the synchronous updates to the in-memory grading records.
    this.transitionRecorderQueue.push(transition);
    this.startTransitionRecorderJob();
  }

  private startTransitionRecorderJob() {

    if (this.transitionRecorderJob) {
      return;
    }
    
    // We don't await this, we just start it ans synchronoulsly return
    this.transitionRecorderJob = this._recordTransitions_impl();
  }

  /** Guaranteed to set this.transitionRecorderJob synchronously before returning the promise */
  private async _recordTransitions_impl() {
    // Note that this will ensure that a recorder job is always
    // ongoing if there are any transitions in the queue.

    while(this.transitionRecorderQueue.length > 0) {
      let nextTransition = this.transitionRecorderQueue[0];
      for(let i = 0; i < nextTransition.ops.length; ++i) {
        await this.strategy.recordOperation(nextTransition.ops[i], nextTransition.client_uuid);
      }
      await db_updateCollaborativeGradingServerEpoch(this.grading_server_pk, ++this.db_epoch);
      this.transitionRecorderQueue.shift(); // only shift after successfully recording - this ensures queue becomes empty synchronously with job completion
    }

    // The only way the queue becomes empty is:
    // 1. The .shift() at the end of the loop above removes only queue item
    // 2. The check in the while() condition above evaluates to false
    // 3. We hit the delete line here
    // This all happens synchronously/atomically
    delete this.transitionRecorderJob;
  }

  public async reloadGradingRecords() {
    this.reload_lock = this.reloadGradingRecordsImpl();
    await this.reload_lock;
    delete this.reload_lock;
  }

  private async reloadGradingRecordsImpl() {
    // TODO: make sure concurrent modifications are handled correctly

    // Wait for all pending transitions to be written to the database before reloading
    while (this.transitionRecorderQueue.length > 0) {
      await this.transitionRecorderJob;
    }

    // Reload grading record
    asMutable(this).grading_records = await this.strategy.loadGradingRecords(this.grading_server_pk);

    // New grading epoch to represent new data in the DB
    await db_updateCollaborativeGradingServerEpoch(this.grading_server_pk, ++this.current_epoch);

    // Force all clients to reload
    this.clearTransitionHistory();
  }

  private clearTransitionHistory() {
    this.transitionHistory.length = 0; // clear array
    this.history_starting_epoch = this.current_epoch;
  }

  public async processManualGradingPing(
    email: string, ping: CollaborativeGradingPingRequest<CGKind>
  ) : Promise<CollaborativeGradingPingResponse<CGKind>> {

    if (this.reload_lock) { await this.reload_lock; }

    asMutable(this.active_graders_by_client_uuid)[ping.client_uuid] = {client_uuid: ping.client_uuid, client_state: ping.client_state, email: email};
    this.next_active_graders_by_client_uuid[ping.client_uuid] = {client_uuid: ping.client_uuid, client_state: ping.client_state, email: email};

    // if the ping contained some new local operations from the client, apply them and advance the epoch
    if (ping.client_operations.length > 0) {
      this.receiveTransition({
        ops: ping.client_operations,
        client_uuid: ping.client_uuid,
        grader_email: email
      });
    }

    const transitions = 
      ping.client_grading_epoch < this.history_starting_epoch ? "reload" :
      ping.client_grading_epoch > this.current_epoch ? "invalid" :
      ping.client_grading_epoch === this.current_epoch ? [] :
    
      // example: if my epoch is 24 and history starts at 22, we do .slice(24 - 22),
      // which is .slice(2) that skips the first two elements in the history
      this.transitionHistory.slice(ping.client_grading_epoch - this.history_starting_epoch);

    return {
      active_graders_by_client_uuid: this.active_graders_by_client_uuid,
      server_epoch: this.current_epoch,
      server_transitions: transitions
    }
  }

}