import assert from "assert";
import { db_getCodeGraderConfig, db_createCodeGraderConfig, db_updateCodeGraderConfig, db_getGroup, db_createGroup, db_setSubmissionGroup } from "./db/db_code_grader";
import { db_getManualGradingQuestion, db_setManualGradingQuestion, db_getManualGradingRubric, db_getManualGradingRecords, db_setManualGradingRecordStatus, db_setManualGradingRecordNotes, db_setManualGradingGroupFinished, db_getManualGradingRubricItem, db_updateManualGradingRubricItem, db_createManualGradingRubricItem, db_getManualGradingQuestionSkins } from "./db/db_rubrics";
import { ManualCodeGraderConfiguration, ManualGradingRubricItem, ManualGradingSkins, ManualGradingQuestionRecords, ManualGradingEpochTransition, ActiveQuestionGraders, ManualGradingOperation, reassignGradingGroups, ManualGradingPingRequest, ManualGradingPingResponse } from "./manual_grading";
import { asMutable, assertFalse, assertNever } from "./util/util";

const DEFAULT_TEST_HARNESS = "{{submission}}";
const DEFAULT_GROUPING_FUNCTION = "main";

const GRADER_IDLE_THRESHOLD = 4000; // ms

export class QuestionGradingServer {
  
  public readonly question_id: string;
  public readonly config: ManualCodeGraderConfiguration;
  public readonly rubric: ManualGradingRubricItem[];

  public readonly skins: ManualGradingSkins = {};

  public readonly grading_record: ManualGradingQuestionRecords;

  private history_starting_epoch: number;
  private transitionHistory: ManualGradingEpochTransition[] = [];

  private transitionRecorderQueue: ManualGradingEpochTransition[] = [];
  private transitionRecorderQueueLock?: Promise<void>;

  public readonly active_graders: ActiveQuestionGraders = {graders: {}};
  private next_active_graders: ActiveQuestionGraders = {graders: {}};

  private reload_lock?: Promise<void>;

  private static INSTANCES : {
    [index: string] : QuestionGradingServer | undefined
  } = { };

  public static async getOrCreate(question_id: string) {

    const existing = this.INSTANCES[question_id];
    if (existing) {
      console.log("reusing existing question grading server for " + question_id);
      return existing;
    }

    console.log("creating question grading server for " + question_id);

    let question = await db_getManualGradingQuestion(question_id);
    if (!question) {
      await db_setManualGradingQuestion(question_id, 0);
    }

    let grader_config = await db_getCodeGraderConfig(question_id);
    if (!grader_config) {
      await db_createCodeGraderConfig(question_id, DEFAULT_TEST_HARNESS, DEFAULT_GROUPING_FUNCTION);
      grader_config = await db_getCodeGraderConfig(question_id);
    }
    assert(grader_config);

    return new QuestionGradingServer(
      question_id,
      await db_getManualGradingRubric(question_id),
      grader_config,
      await loadSkins(question_id),
      await db_getManualGradingRecords(question_id)
    );
  }

  private constructor(question_id: string, rubric: ManualGradingRubricItem[], config: ManualCodeGraderConfiguration, skins: ManualGradingSkins, grading_record: ManualGradingQuestionRecords) {
    this.question_id = question_id;
    this.history_starting_epoch = grading_record.grading_epoch;
    this.rubric = rubric;
    this.config = config;
    this.skins = skins;
    this.grading_record = grading_record;
    
    setInterval(() => {
      asMutable(this).active_graders = this.next_active_graders;
      this.next_active_graders = {graders: {}};
    }, GRADER_IDLE_THRESHOLD);
  }

  private receiveTransition(transition: ManualGradingEpochTransition) {

    // all at once, synchronous transition to next epoch
    // so that clients won't ever get info halfway through
    // an epoch
    transition.ops.map(op => this.applyOperation(op));
    ++(this.grading_record.grading_epoch);

    this.transitionHistory.push(transition);
    if (this.transitionHistory.length > 100) {
      this.transitionHistory.shift();
      ++this.history_starting_epoch;
    }

    // This happens async, but with all transitions/operations in order
    this.transitionRecorderQueue.push(transition);
    this.recordOperations();
  }

  private async recordOperations() {

    // If an async call to process operations was already going,
    // then we won't spawn another one
    if (this.transitionRecorderQueueLock) {
      return;
    }

    this.transitionRecorderQueueLock = this.recordOperationsImpl();
    await this.transitionRecorderQueueLock;
    delete this.transitionRecorderQueueLock;
  }

  private async recordOperationsImpl() {

    while(this.transitionRecorderQueue.length > 0) {
      let nextTransition = this.transitionRecorderQueue.shift()!
      for(let i = 0; i < nextTransition.ops.length; ++i) {
        await this.recordOperation(nextTransition.ops[i]);
      }
      await db_setManualGradingQuestion(this.question_id, this.grading_record.grading_epoch);
    }
    
  }

  private applyOperation(op: ManualGradingOperation) {
    if (op.kind === "set_rubric_item_status") {
      let group = this.grading_record.groups[op.group_uuid];
      if (group) {
        group.grading_result[op.rubric_item_uuid] ??= {};
        group.grading_result[op.rubric_item_uuid]!.status = op.status;
      }
    }
    else if (op.kind === "set_rubric_item_notes") {
      let group = this.grading_record.groups[op.group_uuid];
      if (group) {
        group.grading_result[op.rubric_item_uuid] ??= {};
        group.grading_result[op.rubric_item_uuid]!.notes = op.notes;
      }
    }
    else if (op.kind === "set_group_finished") {
      let group = this.grading_record.groups[op.group_uuid];
      if (group) {
        group.finished = op.finished;
      }
    }
    else if (op.kind === "edit_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_uuid === op.rubric_item_uuid);
      if (existingRi) {
        Object.assign(existingRi, op.edits);
      }
      else {
        // technically should never get here - rubric items can't be deleted, only hidden
        return assertFalse();
      }
    }
    else if (op.kind === "create_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_uuid === op.rubric_item.rubric_item_uuid);
      if (existingRi) {
        Object.assign(existingRi, op.rubric_item);
      }
      else {
        this.rubric.push(op.rubric_item);
      }
    }
    else if (op.kind === "edit_code_grader_config") {
      Object.assign(this.config, op.edits);
    }
    else if (op.kind === "assign_groups_operation") {
      reassignGradingGroups(this.grading_record, op.assignment);
    }
    else {
      return assertNever(op);
    }
  }

  private async recordOperation(op: ManualGradingOperation) {
    if (op.kind === "set_rubric_item_status") {
      return db_setManualGradingRecordStatus(op.group_uuid, op.rubric_item_uuid, op.status);
    }
    else if (op.kind === "set_rubric_item_notes") {
      return db_setManualGradingRecordNotes(op.group_uuid, op.rubric_item_uuid, op.notes);
    }
    else if (op.kind === "set_group_finished") {
      return db_setManualGradingGroupFinished(op.group_uuid, op.finished);
    }
    else if (op.kind === "edit_rubric_item") {
      if (await db_getManualGradingRubricItem(this.question_id, op.rubric_item_uuid)) {
        return db_updateManualGradingRubricItem(this.question_id, op.rubric_item_uuid, op.edits)
      }
      // tehcnically should never get here - rubric items can't be deleted, only hidden
      return assertFalse();
    }
    else if (op.kind === "create_rubric_item") {
      if (await db_getManualGradingRubricItem(this.question_id, op.rubric_item.rubric_item_uuid)) {
        return db_updateManualGradingRubricItem(this.question_id, op.rubric_item.rubric_item_uuid, op.rubric_item)
      }
      else {
        return db_createManualGradingRubricItem(this.question_id, op.rubric_item.rubric_item_uuid, op.rubric_item)
      }
    }
    else if (op.kind === "edit_code_grader_config") {
      db_updateCodeGraderConfig(this.question_id, op.edits)
    }
    else if (op.kind === "assign_groups_operation") {
      for (let submission_uuid in op.assignment) {
        let group_uuid = op.assignment[submission_uuid]!;
        if (!await db_getGroup(group_uuid)) {
          await db_createGroup(group_uuid, this.question_id, false);
        }
        await db_setSubmissionGroup(submission_uuid, group_uuid);
      }
    }
    else {
      return assertNever(op);
    }
  }

  public async reloadGradingRecords() {
    this.reload_lock = this.reloadGradingRecordsImpl();
    await this.reload_lock;
    delete this.reload_lock;
  }

  private async reloadGradingRecordsImpl() {

    // Wait for all pending transitions to be written to the database before reloading
    await this.transitionRecorderQueueLock;

    // Reload grading record
    asMutable(this).grading_record = await db_getManualGradingRecords(this.question_id);

    // Reload skins (may come with new submissions added to DB)
    asMutable(this).skins = await loadSkins(this.question_id);

    // New grading epoch to represent new data in the DB
    await db_setManualGradingQuestion(this.question_id, ++this.grading_record.grading_epoch);

    // Force all clients to reload
    this.clearTransitionHistory();
  }

  private clearTransitionHistory() {
    this.transitionHistory.length = 0; // clear array
    this.history_starting_epoch = this.grading_record.grading_epoch;
  }

  public claimNextUngradedGroup(email: string, client_uuid: string, desired: string[]) {
    let claimed = new Set<string>(Object.values(this.active_graders.graders).map(g => g.group_uuid ?? ""));

    // Check the client's desired next groups in order to see if one is ok
    let next_uuid = desired.find(uuid => {
      let group = this.grading_record.groups[uuid];
      return group && !group.finished && !claimed.has(uuid);
    });

    // If we found one to give to the client, go ahead and mark them as active on that
    if (next_uuid) {
      this.active_graders.graders[client_uuid] = {group_uuid: next_uuid, email: email};
      this.next_active_graders.graders[client_uuid] = {group_uuid: next_uuid, email: email};
    }

    // May be undefined if there were none available, client will handle that
    return next_uuid;
  }

  public async processManualGradingPing(email: string, ping: ManualGradingPingRequest) : Promise<ManualGradingPingResponse> {

    if (this.reload_lock) { await this.reload_lock; }

    this.active_graders.graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
    this.next_active_graders.graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};

    // if the ping contained some new local operations from the client, apply them and advance the epoch
    if (ping.my_operations.length > 0) {
      this.receiveTransition({
        ops: ping.my_operations,
        client_uuid: ping.client_uuid,
        grader_email: email
      });
    }

    let transitions: ManualGradingPingResponse["epoch_transitions"];

    if (ping.my_grading_epoch < this.history_starting_epoch) {
      transitions = "reload";
    }
    else if(ping.my_grading_epoch > this.grading_record.grading_epoch) {
      transitions = "invalid";
    }
    else if (ping.my_grading_epoch === this.grading_record.grading_epoch) {
      transitions = [];
    }
    else {
      // example: if my epoch is 24 and history starts at 22, we do .slice(24 - 22),
      // which is .slice(2) that skips the first two elements in the history
      transitions = this.transitionHistory.slice(ping.my_grading_epoch - this.history_starting_epoch);
    }

    return {
      question_id: this.question_id,
      active_graders: this.active_graders,
      grading_epoch: this.grading_record.grading_epoch,
      epoch_transitions: transitions
    }
  }
}

async function loadSkins(question_id: string) {
  let skins : ManualGradingSkins = {};
  (await db_getManualGradingQuestionSkins(question_id)).forEach(s => {
    skins[s.skin_id] = {
      skin_id: s.skin_id,
      non_composite_skin_id: s.non_composite_skin_id,
      replacements: s.replacements
    };
  });
  return skins;
}