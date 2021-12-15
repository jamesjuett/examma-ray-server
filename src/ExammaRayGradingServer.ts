import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import { readdirSync } from "fs";
import { copyFile, readFile } from "fs/promises";
import { JwtUserInfo } from "./auth/jwt_auth";
import { ActiveGraders, ManualCodeGraderConfiguration, ManualGradingEpochTransition, ManualGradingOperation, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecords, ManualGradingRubricItem, ManualGradingRubricItemStatus, ManualGradingSkins, ManualGradingSubmission, reassignGradingGroups } from "./manual_grading";
import { asMutable, assert, assertExists, assertFalse, assertNever } from "./util/util";
import { Worker } from "worker_threads";
import { ExamGeneratorSpecification } from "examma-ray/dist/ExamGenerator";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { db_getExamEpoch, db_nextExamEpoch } from "./db/db_exams";
import { WorkerData_Generate } from "./run/types";
import { db_createManualGradingRubricItem, db_getGroupSubmissions, db_getManualGradingQuestion, db_getManualGradingQuestionSkin, db_getManualGradingQuestionSkins, db_getManualGradingRecords, db_getManualGradingRubric, db_getManualGradingRubricItem, db_setManualGradingGroupFinished, db_setManualGradingQuestion, db_setManualGradingRecordNotes, db_setManualGradingRecordStatus, db_updateManualGradingRubricItem } from "./db/db_rubrics";
import { db_createCodeGraderConfig, db_createGroup, db_getCodeGraderConfig, db_getGroup, db_setSubmissionGroup, db_updateCodeGraderConfig } from "./db/db_code_grader";

const GRADER_IDLE_THRESHOLD = 4000; // ms

export type ExamTaskStatus = {
  submissions?: string,
  generate?: string,
  grade?: string
}

export class ServerExam {

  public readonly exam: Exam;
  public readonly epoch?: number;

  public readonly taskStatus: ExamTaskStatus = { };

  private readonly questionGradingServers: {
    [index: string]: QuestionGradingServer | undefined
  } = {};

  private constructor(exam: Exam, question_servers: readonly QuestionGradingServer[]) {
    this.exam = exam;
    question_servers.forEach(qs => this.questionGradingServers[qs.question_id] = qs);
  }

  public static async create(exam_spec: ExamSpecification) {
    const exam = Exam.create(exam_spec);
    return new ServerExam(
      exam,
      await Promise.all(exam.allQuestions.map(q => QuestionGradingServer.create(exam.exam_id, q.question_id)))
    );
  }
  
  public async getRoster() {
    return ExamUtils.loadCSVRoster(`data/${this.exam.exam_id}/roster.csv`);
  }

  public async update(updates: {
    new_roster_csv_filepath?: string,
    new_secret_filepath?: string
  }) {

    if (updates.new_roster_csv_filepath) {
      this.setRoster(updates.new_roster_csv_filepath);
    }

    if (updates.new_secret_filepath) {
      this.setSecret(updates.new_secret_filepath);
    }

    await this.generateExams();
    await this.nextEpoch();
  }

  private async setRoster(new_roster_csv_filepath: string) {
    await copyFile(new_roster_csv_filepath, `data/${this.exam.exam_id}/roster.csv`);
  }
  
  private async setSecret(new_secret_filepath: string) {
    await copyFile(new_secret_filepath, `data/${this.exam.exam_id}/secret`);
  }

  private async generateExams() {
    
    console.log("GENERATING EXAMS".bgBlue);

    let secret = await readFile(`data/${this.exam.exam_id}/secret`, "utf-8");
    let roster = await ExamUtils.loadCSVRoster(`data/${this.exam.exam_id}/roster.csv`);

    const worker = new Worker("./build/run/gen.js", {
      workerData: <WorkerData_Generate>{
        exam_id: this.exam.exam_id,
        roster: roster,
        gen_spec: {
          uuid_strategy: "uuidv5",
          uuidv5_namespace: secret,
          frontend_js_path: "js/frontend.js"
        }
      }
    });

    this.taskStatus.generate = `Preparing to generate ${roster.length} exams...`;

    await this.workerTask(worker, "generate");
  }

  public async addSubmissions(files: readonly Express.Multer.File[]) {

    this.taskStatus.generate = `Adding submissions...`;

    // Files will have been uploaded to "/uploads" and information about
    // each is in the files object. We'll pass this off to a worker
    // script to process each
    const worker = new Worker("./build/run/process_submissions.js", {
      workerData: {
        exam_id: this.exam.exam_id,
        files: files
      }
    });

    await this.workerTask(worker, "submissions");
    await this.nextEpoch();

    // All question grading servers will need to reload new submission
    // data from the DB
    await Promise.all(Object.values(this.questionGradingServers).map(qgs => qgs!.reloadGradingRecords()));
  }

  private workerTask(worker: Worker, task: keyof ExamTaskStatus) {
    return new Promise<void>((resolve, reject) => {
      worker.on("message", (status: string) => this.taskStatus[task] = status)
      worker.on("error", () => {
        this.taskStatus[task] = "ERROR";
        reject();
      });
      worker.on("exit", (exitCode) => {
        if (exitCode === 0) {
          delete this.taskStatus[task];
          resolve();
        }
        else {
          this.taskStatus[task] = "ERROR";
          reject();
        }
      });
    });
  }

  public async getEpoch() {
    return this.epoch ?? await db_getExamEpoch(this.exam.exam_id);
  }

  private async nextEpoch() {
    asMutable(this).epoch = await db_nextExamEpoch(this.exam.exam_id);
  }

  public getTaskStatus() {
    return this.taskStatus;
  }
  
  public getGradingServer(question_id: string) {
    return this.questionGradingServers[question_id];
  }
}


const DEFAULT_TEST_HARNESS = "{{submission}}";
const DEFAULT_GROUPING_FUNCTION = "main";

export class QuestionGradingServer {
  
  public readonly exam_id: string;
  public readonly question_id: string;
  public readonly config: ManualCodeGraderConfiguration;
  public readonly rubric: ManualGradingRubricItem[];

  public readonly skins: ManualGradingSkins = {};

  public readonly grading_record: ManualGradingQuestionRecords;

  private history_starting_epoch: number;
  private transitionHistory: ManualGradingEpochTransition[] = [];

  private transitionRecorderQueue: ManualGradingEpochTransition[] = [];
  private transitionRecorderQueueLock?: Promise<void>;

  // TODO: these unnecessarily index based on question_id which is always the same for a single question server
  public readonly active_graders: ActiveGraders = {};
  private next_active_graders: ActiveGraders = {};

  private reload_lock?: Promise<void>;

  public static async create(exam_id: string, question_id: string) {
    console.log("creating question grading server for " + exam_id + " " + question_id);
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
      exam_id,
      question_id,
      await db_getManualGradingRubric(question_id),
      grader_config,
      await loadSkins(question_id),
      await db_getManualGradingRecords(question_id)
    );
  }

  private constructor(exam_id: string, question_id: string, rubric: ManualGradingRubricItem[], config: ManualCodeGraderConfiguration, skins: ManualGradingSkins, grading_record: ManualGradingQuestionRecords) {
    this.exam_id = exam_id;
    this.question_id = question_id;
    this.history_starting_epoch = grading_record.grading_epoch;
    this.rubric = rubric;
    this.config = config;
    this.skins = skins;
    this.grading_record = grading_record;
    
    setInterval(() => {
      asMutable(this).active_graders = this.next_active_graders;
      this.next_active_graders = {};
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
    asMutable(this).skins = {};

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
    let claimed = new Set<string>(Object.values(this.active_graders[this.question_id].graders).map(g => g.group_uuid ?? ""));

    // Check the client's desired next groups in order to see if one is ok
    let next_uuid = desired.find(uuid => {
      let group = this.grading_record.groups[uuid];
      return group && !group.finished && !claimed.has(uuid);
    });

    // If we found one to give to the client, go ahead and mark them as active on that
    if (next_uuid) {
      (this.active_graders[this.question_id] ??= {graders: {}}).graders[client_uuid] = {group_uuid: next_uuid, email: email};
      (this.next_active_graders[this.question_id] ??= {graders: {}}).graders[client_uuid] = {group_uuid: next_uuid, email: email};
    }

    // May be undefined if there were none available, client will handle that
    return next_uuid;
  }

  public async processManualGradingPing(email: string, ping: ManualGradingPingRequest) : Promise<ManualGradingPingResponse> {

    if (this.reload_lock) { await this.reload_lock; }

    (this.active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
    (this.next_active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};

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
      exam_id: this.exam_id,
      question_id: this.question_id,
      active_graders: this.active_graders,
      grading_epoch: this.grading_record.grading_epoch,
      epoch_transitions: transitions
    }
  }
}



export class ExammaRayGradingServer {

  public readonly exams: readonly ServerExam[];
  public readonly exams_by_id: {
    [index: string]: ServerExam | undefined
  } = {};

  private constructor(exams: readonly ServerExam[]) {
    this.exams = exams;
    this.exams.forEach(exam => this.exams_by_id[exam.exam.exam_id] = exam);
  }

  public static async create(exam_specs: readonly ExamSpecification[]) {
    return new ExammaRayGradingServer(
      await Promise.all(exam_specs.map(spec => ServerExam.create(spec)))
    )
  }

  public async loadExam(exam_spec: ExamSpecification) {
    const newExam = await ServerExam.create(exam_spec);

    let existingIndex = this.exams.findIndex(ex => ex.exam.exam_id === newExam.exam.exam_id);
    if (existingIndex !== -1) {
      asMutable(this.exams)[existingIndex] = newExam;
    }
    else {
      asMutable(this.exams).push(newExam);
    }

    this.exams_by_id[newExam.exam.exam_id] = newExam;
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