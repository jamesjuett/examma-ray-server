import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { readFileSync } from "fs";
import { copyFile, readFile, rm } from "fs/promises";
import { DB_Exams, DB_Live_Exam_Assignments, DB_Live_Exam_Instances } from "knex/types/tables";
import { Worker } from "worker_threads";
import { RunGradingRequest } from "./dashboard";
import { db_createCodeGraderConfig, db_createGroup, db_deleteManualGradingByExam, db_deleteManualGradingBySubmission, db_getCodeGraderConfig, db_getGroup, db_setSubmissionGroup, db_updateCodeGraderConfig } from "./db/db_code_grader";
import { db_getOrCreateExam, db_deleteExam, db_deleteExamSubmissionByUuid, db_deleteExamSubmissions, db_getExam, db_getExamEpoch, db_getExamSubmissionByUuid, db_nextExamEpoch } from "./db/db_exams";
import { db_createManualGradingRubricItem, db_getManualGradingQuestion, db_getManualGradingQuestionSkins, db_getManualGradingRecords, db_getManualGradingRubric, db_getManualGradingRubricItem, db_setManualGradingGroupFinished, db_setManualGradingQuestion, db_setManualGradingRecordNotes, db_setManualGradingRecordStatus, db_updateManualGradingRubricItem } from "./db/db_rubrics";
import { ActiveExamGraders, ActiveQuestionGraders, ManualCodeGraderConfiguration, ManualGradingEpochTransition, ManualGradingOperation, ManualGradingPingRequest, ManualGradingPingResponse, ManualGradingQuestionRecords, ManualGradingRubricItem, ManualGradingSkins, reassignGradingGroups } from "./manual_grading";
import { WorkerData_Generate, WorkerData_Grade, WorkerData_ProcessSubmissions } from "./run/types";
import { asMutable, assert, assertExists, assertFalse, assertNever } from "./util/util";
import { ServerTasks } from "./ServerTasks";
import { db_createLiveExamAssignment, db_getLiveExamAssignmentsByInstance, db_getLiveExamInstanceByUuid, db_getLiveExamInstancesByExamId } from "./db/db_live";
import { createStudentExamUuid } from "examma-ray/dist/core/assigned_exams";
import { v4 as uuidv4 } from "uuid";

function MAKE_UMICH_EMAIL(uniqname: string) {
  return uniqname + "@umich.edu";
}

const GRADER_IDLE_THRESHOLD = 4000; // ms

export type ExamTask = 
  | "submissions"
  | "generate"
  | "grade";

export type ExamTaskStatus = ServerTasks<ExamTask>["taskStatus"];

export class ExamInstanceServer {
  // all the fields from DB_Live_Exam_Instances
  public readonly exam_instance_uuid: string
  public readonly exam_id: string
  public readonly duration_seconds: number
  public readonly uuidv5_namespace: string
  public readonly randomization_seed: string

  public readonly epoch: string;
  
  public readonly tasks: ServerTasks<ExamTask>;

  public readonly exam_assignments: readonly DB_Live_Exam_Assignments[];
  public readonly exam_assignments_by_uniqname: Map<string, Readonly<DB_Live_Exam_Assignments>>;

  private readonly uniqnames_pending_exam_assignment: Set<string> = new Set();

  private constructor(db_instance: DB_Live_Exam_Instances, db_assignments: readonly DB_Live_Exam_Assignments[]) {
    this.exam_instance_uuid = db_instance.exam_instance_uuid;
    this.exam_id = db_instance.exam_id;
    this.duration_seconds = db_instance.duration_seconds;
    this.uuidv5_namespace = db_instance.uuidv5_namespace;
    this.randomization_seed = db_instance.randomization_seed;
    this.epoch = uuidv4();
    this.exam_assignments = db_assignments;
    this.exam_assignments_by_uniqname = new Map(db_assignments.map(assgn => [assgn.uniqname, assgn]));
  }

  public static async create(exam_instance_uuid: string) {
    return new ExamInstanceServer( 
      assertExists(await db_getLiveExamInstanceByUuid(exam_instance_uuid)),
      await db_getLiveExamAssignmentsByInstance(exam_instance_uuid),
    );
  }

  public getEpoch() {
    return this.epoch;
  }

  private nextEpoch() {
    asMutable(this).epoch = uuidv4();
  }

  public async addToRoster(roster: StudentInfo[]) {
    // Add all students in the roster to the exam assignments if they aren't already there
    const new_students = roster.filter(student =>
      !this.exam_assignments_by_uniqname.has(student.uniqname)
      && !this.uniqnames_pending_exam_assignment.has(student.uniqname)
    );

    new_students.forEach(student => this.uniqnames_pending_exam_assignment.add(student.uniqname));

    // Prior to this point, things run synchronously/atomically and will make sure other, interleaved
    // calls to addToRoster() won't try to add the same student multiple times.

    const new_assns = await Promise.all(new_students.map(async (student) => db_createLiveExamAssignment(
      createStudentExamUuid({strategy: "uuidv5", v5_namespace: this.uuidv5_namespace}, student, this.exam_id),
      this.exam_instance_uuid,
      student.uniqname,
      MAKE_UMICH_EMAIL(student.uniqname),
    )));

    await this.generateExams(new_students);

    // This is also synchronous/atomic
    new_assns.forEach(assn => {
      this.uniqnames_pending_exam_assignment.delete(assn.uniqname);
      asMutable(this.exam_assignments).push(assn);
    });
    
    this.nextEpoch();
  };

  public async generateExams(students: readonly StudentInfo[]) {
    
    console.log("GENERATING EXAMS".bgBlue);

    const worker_data : WorkerData_Generate = {
      exam_id: this.exam_id,
      exam_instance_uuid: this.exam_instance_uuid,
      students: students,
      gen_spec: {
        uuid_options: {
          strategy: "uuidv5",
          v5_namespace: this.uuidv5_namespace,
        },
        frontend_js_path: "js"
      }
    };
    const worker = new Worker("./build/run/gen.js", {
      workerData: worker_data
    });

    return this.tasks.workerTask(worker, "generate", `Preparing to generate ${students.length} exams...`);
  }

};


export class ExamServer {

  public readonly exam: Exam;
  
  public readonly exam_instances : readonly ExamInstanceServer[] = [];
  public readonly exam_instances_by_uuid: {
    [index: string]: ExamInstanceServer | undefined
  };

  public readonly epoch: number;

  public readonly tasks: ServerTasks<ExamTask>;

  private readonly questionGradingServers: {
    [index: string]: QuestionGradingServer | undefined
  } = {};

  private constructor(exam: Exam, exam_instances: readonly ExamInstanceServer[], epoch: number, question_servers: readonly QuestionGradingServer[]) {
    this.exam = exam;
    this.exam_instances = exam_instances;
    this.exam_instances_by_uuid = Object.fromEntries(this.exam_instances.map(ei => [ei.exam_instance_uuid, ei]));
    this.epoch = epoch;
    question_servers.forEach(qs => this.questionGradingServers[qs.question_id] = qs);
    this.tasks = new ServerTasks();
  }

  public static async create(exam_spec: ExamSpecification) {
    const db_exam_instances = await db_getLiveExamInstancesByExamId(exam_spec.exam_id);
    const exam = Exam.create(exam_spec);
    return new ExamServer(
      exam,
      await Promise.all(db_exam_instances.map(ei => ExamInstanceServer.create(ei.exam_instance_uuid))),
      0,
      await Promise.all(exam.allQuestions.map(q => QuestionGradingServer.getOrCreate(q.question_id)))
    );
  }

  public async getEpoch() {
    return this.epoch ?? await db_getExamEpoch(this.exam.exam_id);
  }

  private async nextEpoch() {
    asMutable(this).epoch = (await db_nextExamEpoch(this.exam.exam_id))[0];
  }
  
  public async getExamInstances() {
    return this.exam_instances;
  }

  public async getExamInstanceByUuid(exam_instance_uuid: string) {
    return this.exam_instances_by_uuid[exam_instance_uuid];
  }

  public getExamInfo() {
    return {
      exam_id: this.exam.exam_id,
      exam_instances: this.exam_instances.map(ei => (ei.exam_instance_uuid)),
      epoch: this.epoch,
    };
  }

  public async updateSpec(new_exam_spec: ExamSpecification) {
    asMutable(this).exam = Exam.create(new_exam_spec);
    await Promise.all(
      this.exam.allQuestions.map(
        async (question) => this.questionGradingServers[question.question_id] ??= await QuestionGradingServer.getOrCreate(question.question_id)
      )
    );
  }

  public async gradeAllExams(run_request: RunGradingRequest) {
    
    console.log(run_request.reports ? "Grading...".bgBlue : "Generating grading reports...".bgBlue);

    // Grade all 
  }

  public async gradeExamInstance(exam_instance: DB_Live_Exam_Instances, run_request: RunGradingRequest) {
    const grader_worker_data : WorkerData_Grade = {
      exam_instance: exam_instance,
      grade_request: run_request,
    };

    const worker = new Worker("./build/run/grade.js", {
      workerData: grader_worker_data
    });
    return this.tasks.workerTask(worker, "grade", `Preparing to grade exam instance ${exam_instance.exam_instance_uuid}...`);
  }

  public async getLiveSubmissionByExamUuid(exam_uuid: string) {
    return db_getExamSubmissionByUuid(exam_uuid);
  }

  public async addSubmissions(files: readonly Express.Multer.File[]) {

    // Files will have been uploaded to "/uploads" and information about
    // each is in the files object. We'll pass this off to a worker
    // script to process each
    const worker = new Worker("./build/run/process_submissions.js", {
      workerData: <WorkerData_ProcessSubmissions>{
        exam_id: this.exam.exam_id,
        files: files
      }
    });

    await this.tasks.workerTask(worker, "submissions", "Preparing to add submissions...");
    await this.nextEpoch();

    // All question grading servers will need to reload new submission data from the DB
    await Promise.all(Object.values(this.questionGradingServers).map(qgs => qgs!.reloadGradingRecords()));
  }
  
  public async deleteSubmissionByUuid(submission_uuid: string) {

    let exam_submission = await db_getExamSubmissionByUuid(submission_uuid);

    if (!exam_submission) {
      // exam didn't exist, nothing to do
      return;
    }

    // Remove exam submission from DB
    await db_deleteExamSubmissionByUuid(exam_submission.uuid);

    // Remove all associated question submission info and grading records from the DB
    await db_deleteManualGradingBySubmission(exam_submission.exam_id, exam_submission.uniqname);
    
    // Remove our stored copy of the submission file
    await rm(`data/${exam_submission.exam_id}/submissions/${exam_submission.uniqname}-submission.json`, { force: true });

    await this.nextEpoch();

    // All question grading servers will need to reload new submission data from the DB
    await Promise.all(Object.values(this.questionGradingServers).map(qgs => qgs!.reloadGradingRecords()));
  }

  public async deleteEverything() {
    await db_deleteManualGradingByExam(this.exam.exam_id);
    await db_deleteExamSubmissions(this.exam.exam_id);
    await db_deleteExam(this.exam.exam_id);

    // Remove the exam data directory
    await rm(`data/${this.exam.exam_id}/`, { force: true, recursive: true });

    // All question grading servers will need to reload new submission data from the DB
    await Promise.all(Object.values(this.questionGradingServers).map(qgs => qgs!.reloadGradingRecords()));
  }

  public getTaskStatus() {
    return this.tasks.taskStatus;
  }
  
  public getGradingServer(question_id: string) {
    return this.questionGradingServers[question_id];
  }

  public getActiveGraders() {
    let active_graders: ActiveExamGraders = {};
    Object.values(this.questionGradingServers).forEach(qgs => active_graders[qgs!.question_id] = qgs!.active_graders)
    return active_graders;
  }
}


const DEFAULT_TEST_HARNESS = "{{submission}}";
const DEFAULT_GROUPING_FUNCTION = "main";

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



export class ExammaRayGradingServer {

  private readonly exams_by_id: {
    [index: string]: ExamServer | undefined
  } = {};

  private constructor(exams: readonly ExamServer[]) {
    exams.forEach(exam => this.exams_by_id[exam.exam.exam_id] = exam);
  }

  public static async create(exam_specs: readonly ExamSpecification[]) {
    return new ExammaRayGradingServer(
      await Promise.all(exam_specs.map(spec => ExamServer.create(spec)))
    )
  }

  public getExamServer(exam_id: string) {
    return this.exams_by_id[exam_id];
  }

  public async loadExamServer(exam_spec: ExamSpecification) {
    this.exams_by_id[exam_spec.exam_id] = await ExamServer.create(exam_spec);
  }

  public unloadExamServer(exam_id: string) {
    const exam_server = this.exams_by_id[exam_id];
    delete this.exams_by_id[exam_id];
    return exam_server;
  }

  public getAllExams() {
    return Object.values(this.exams_by_id) as ExamServer[];
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