import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import { readdirSync } from "fs";
import { copyFile, readFile } from "fs/promises";
import { JwtUserInfo } from "./auth/jwt_auth";
import { ActiveGraders, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecord, ManualGradingRubricItem, ManualGradingRubricItemStatus } from "./manual_grading";
import { asMutable, assertExists, assertFalse, assertNever } from "./util/util";
import { Worker } from "worker_threads";
import { ExamGeneratorSpecification } from "examma-ray/dist/ExamGenerator";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { db_getExamEpoch, db_nextExamEpoch } from "./db/db_exams";
import { WorkerData_Generate } from "./run/types";
import { db_createManualGradingRubricItem, db_getManualGradingQuestion, db_getManualGradingRecords, db_getManualGradingRubric, db_setManualGradingGroupFinished, db_setManualGradingQuestion, db_setManualGradingRecord, db_updateManualGradingRubricItem } from "./db/db_rubrics";
import { assert } from "console";

const GRADER_IDLE_THRESHOLD = 10000; // ms

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

// NOTE: all operations must be idempotent and must not depend on previous state
export type ManualGradingOperation = {
  kind: "set_rubric_item_status",
  group_uuid: string,
  rubric_item_id: string,
  status: ManualGradingRubricItemStatus
} | {
  kind: "set_group_finished",
  group_uuid: string,
  finished: boolean
} | {
  kind: "edit_rubric_item",
  rubric_item_id: string,
  edits: Partial<ManualGradingRubricItem>  
} | {
  kind: "create_rubric_item",
  rubric_item: ManualGradingRubricItem,
  // after: string
}

export type ManualGradingEpochTransition = {
  ops: ManualGradingOperation[]
};

export class QuestionGradingServer {
  
  public readonly exam_id: string;
  public readonly question_id: string;
  public readonly rubric: ManualGradingRubricItem[];

  public readonly grading_record: ManualGradingQuestionRecord;
  private history_starting_epoch: number;
  private transitionHistory: ManualGradingEpochTransition[] = [];

  private epochQueue: ManualGradingEpochTransition[] = [];
  private epochQueueLock: boolean = false;

  public readonly active_graders: ActiveGraders = {};
  private next_active_graders: ActiveGraders = {};

  public static async create(exam_id: string, question_id: string) {
    let question = await db_getManualGradingQuestion(question_id);
    if (!question) {
      await db_setManualGradingQuestion(question_id, 0);
      question = await db_getManualGradingQuestion(question_id);
    }
    assert(question);
    return new QuestionGradingServer(
      exam_id,
      question_id,
      await db_getManualGradingRubric(question_id),
      await db_getManualGradingRecords(question_id)
    );
  }

  private constructor(exam_id: string, question_id: string, rubric: ManualGradingRubricItem[], grading_record: ManualGradingQuestionRecord) {
    this.exam_id = exam_id;
    this.question_id = question_id;
    this.history_starting_epoch = grading_record.grading_epoch;
    this.rubric = rubric;
    this.grading_record = grading_record;
    

    setInterval(() => {
      asMutable(this).active_graders = this.next_active_graders;
      this.next_active_graders = {};
    }, GRADER_IDLE_THRESHOLD);
  }

  public receiveOperations(ops: ManualGradingOperation[]) {
    this.epochQueue.push({
      ops: ops
    });
  }

  public async processOperations() {

    // If an async call to process operations was already going,
    // then we won't spawn another one
    if (this.epochQueueLock) {
      return;
    }
    
    this.epochQueueLock = true;

    while(this.epochQueue.length > 0) {
      let next = this.epochQueue.shift()!;

      // all at once, synchronous transition to next epoch
      // so that clients won't ever get info halfway through
      // an epoch
      let recordOperations = next.ops.map(op => this.applyOperation(op));
      ++(this.grading_record.grading_epoch);

      this.transitionHistory.push(next);
      if (this.transitionHistory.length > 100) {
        this.transitionHistory.shift();
      }

      // ok to record asynch, though the individual operations
      // within an epoch transition must still be sequenced in order
      for(let i = 0; i < recordOperations.length; ++i) {
        await recordOperations[i]();
      }

      await db_setManualGradingQuestion(this.question_id, this.grading_record.grading_epoch);
    }

    this.epochQueueLock = false;
  }

  // Note that this doesn't create any promises - it returns functors that can
  // be executed to create the promises later
  private applyOperation(op: ManualGradingOperation) : () => Promise<unknown> {
    if (op.kind === "set_rubric_item_status") {
      this.grading_record.groups[op.group_uuid].grading_result[op.rubric_item_id] = op.status;
      return () => db_setManualGradingRecord(op.group_uuid, op.rubric_item_id, op.status);
    }
    else if (op.kind === "set_group_finished") {
      this.grading_record.groups[op.group_uuid].finished = op.finished;
      return () => db_setManualGradingGroupFinished(op.group_uuid, op.finished);
    }
    else if (op.kind === "edit_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_id === op.rubric_item_id);
      if (existingRi) {
        Object.assign(existingRi, op.edits);
        return () => db_updateManualGradingRubricItem(this.question_id, op.rubric_item_id, op.edits)
      }
      // tehcnically should never get here - rubric items can't be deleted, only hidden
      return assertFalse();
    }
    else if (op.kind === "create_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_id === op.rubric_item.rubric_item_id);
      if (existingRi) {
        Object.assign(existingRi, op.rubric_item);
        return () => db_updateManualGradingRubricItem(this.question_id, op.rubric_item.rubric_item_id, op.rubric_item)
      }
      else {
        this.rubric.push(op.rubric_item);
        return () => db_createManualGradingRubricItem(this.question_id, op.rubric_item.rubric_item_id, op.rubric_item)
      }
    }
    else {
      return assertNever(op);
    }
  }

  private async recordOperation(op: ManualGradingOperation) {
    if (op.kind === "set_rubric_item_status") {
      this.grading_record.groups[op.group_uuid].grading_result[op.rubric_item_id] = op.status;
    }
    else if (op.kind === "set_group_finished") {
      this.grading_record.groups[op.group_uuid].finished = op.finished;
    }
    else if (op.kind === "edit_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_id === op.rubric_item_id);
      if (existingRi) {
        Object.assign(existingRi, op.edits);
      }
      // tehcnically should never get here - rubric items can't be deleted, only hidden
    }
    else if (op.kind === "create_rubric_item") {
      let existingRi = this.rubric.find(ri => ri.rubric_item_id === op.rubric_item.rubric_item_id);
      if (existingRi) {
        Object.assign(existingRi, op.rubric_item);
      }
      else {
        this.rubric.push(op.rubric_item);
      }
    }
    else {
      assertNever(op);
    }
  }

  public processManualGradingPing(email: string, ping: ManualGradingPingRequest) : ManualGradingPingResponse {
    (this.active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
    (this.next_active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};

    let transitions: ManualGradingPingResponse["epoch_transitions"];

    if (ping.my_grading_epoch === undefined) {
      transitions = "reload";
    }
    else if (ping.my_grading_epoch < this.history_starting_epoch) {
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