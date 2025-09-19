import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import { createStudentExamUuid } from "examma-ray/dist/core/assigned_exams";
import { rm } from "fs/promises";
import { DB_Live_Exam_Assignments, DB_Live_Exam_Instances, DB_Live_Windows } from "knex/types/tables";
import { v4 as uuidv4 } from "uuid";
import { Worker } from "worker_threads";
import { RunGradingRequest } from "./dashboard";
import { db_deleteManualGradingByExam, db_deleteManualGradingBySubmission } from "./db/db_code_grader";
import { db_deleteExam, db_deleteExamSubmissionByUuid, db_deleteExamSubmissions, db_getExamSubmissionByUuid } from "./db/db_exams";
import { db_createOrUpdateExamInstanceWindowsWithUuids, db_createLiveExamAssignment, db_createLiveExamInstance, db_getExamInstanceWindows, db_getLiveExamAssignmentsByInstance, db_getLiveExamInstanceByUuid, db_getLiveExamInstancesByExamId, db_getLiveExamSubmissions, db_updateLiveExamAssignment } from "./db/db_live";
import { ActiveExamGraders } from "./manual_grading";
import { QuestionGradingServer } from "./QuestionGradingServer";
import { runGenerateWorker, runGradeWorker } from "./run/run";
import { ServerTasks } from "./ServerTasks";
import { asMutable, assertExists } from "./util/util";
import { ExamAssignmentInfo, ExamInfo, ExamInstanceInfo, WindowInfo } from "./rest_types";
import { assert } from "console";

function MAKE_UMICH_EMAIL(uniqname: string) {
  return uniqname + "@umich.edu";
}

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

  private readonly assigned_exams: readonly ExamAssignmentInfo[];
  private readonly assigned_exams_by_uniqname: Map<string, Readonly<ExamAssignmentInfo>>;

  private readonly windows_by_uuid: Map<string, Readonly<WindowInfo>> = new Map();
  private windows_sorted_open_asc: Readonly<WindowInfo>[];
  private windows_sorted_close_asc: Readonly<WindowInfo>[];

  private modification_lock: Promise<void> = Promise.resolve();

  private constructor(db_instance: DB_Live_Exam_Instances, db_assignments: readonly ExamAssignmentInfo[], db_windows: readonly DB_Live_Windows[]) {
    this.exam_instance_uuid = db_instance.exam_instance_uuid;
    this.exam_id = db_instance.exam_id;
    this.duration_seconds = db_instance.duration_seconds;
    this.uuidv5_namespace = db_instance.uuidv5_namespace;
    this.randomization_seed = db_instance.randomization_seed;
    this.assigned_exams = db_assignments;
    this.assigned_exams_by_uniqname = new Map(db_assignments.map(assgn => [assgn.uniqname, assgn]));
    this.windows_sorted_open_asc = db_windows.slice().sort((a, b) => a.open_time.getTime() - b.open_time.getTime());
    this.windows_sorted_close_asc = db_windows.slice().sort((a, b) => a.close_time.getTime() - b.close_time.getTime());
    this.windows_by_uuid = new Map(db_windows.map(w => [w.window_uuid, w]));
    
    this.epoch = uuidv4();
    this.tasks = new ServerTasks();
  }

  public static async create(exam_instance_uuid: string) {
    return new ExamInstanceServer( 
      assertExists(await db_getLiveExamInstanceByUuid(exam_instance_uuid)),
      await db_getLiveExamAssignmentsByInstance(exam_instance_uuid),
      await db_getExamInstanceWindows(exam_instance_uuid),
    );
  }

  public getEpoch() {
    return this.epoch;
  }

  private nextEpoch() {
    asMutable(this).epoch = uuidv4();
  }

  public getInfo() : ExamInstanceInfo {
    return {
      exam_instance_uuid: this.exam_instance_uuid,
      name: this.exam_id,
      exam_id: this.exam_id,
      duration_seconds: this.duration_seconds,
      uuidv5_namespace: this.uuidv5_namespace,
      randomization_seed: this.randomization_seed,
      epoch: this.epoch,
    };
  }

  public getTaskStatus() {
    return this.tasks.taskStatus;
  }

  public getWindows() {
    return this.windows_sorted_open_asc;
  }

  public async addWindows(windows: readonly Omit<WindowInfo, "exam_instance_uuid">[]) {

    const windows_with_exam_instance_uuid : readonly WindowInfo[] = windows.map(w => ({
      ...w,
      exam_instance_uuid: this.exam_instance_uuid,
    }));

    await db_createOrUpdateExamInstanceWindowsWithUuids(windows_with_exam_instance_uuid);

    // Wait until they're definitely in the DB, then add all in one atomic/synchronous go here.
    windows_with_exam_instance_uuid.forEach(w => this.windows_by_uuid.set(w.window_uuid, w));
    this.windows_sorted_open_asc = Array.from(this.windows_by_uuid.values()).sort((a, b) => a.open_time.getTime() - b.open_time.getTime());
    this.windows_sorted_close_asc = Array.from(this.windows_by_uuid.values()).sort((a, b) => a.close_time.getTime() - b.close_time.getTime());
    this.nextEpoch();
  }

  public getRoster() : StudentInfo[] {
    return this.assigned_exams.map(assn => ({
      uniqname: assn.uniqname,
      name: assn.name ?? assn.uniqname,
    }));
  }

  public async updateRoster(roster: (Pick<ExamAssignmentInfo, "uniqname"> & Partial<Pick<ExamAssignmentInfo, "uniqname" | "name" | "window_uuid" | "force_open" | "duration_multiplier">>)[]) {
    this.modification_lock = new Promise(async (resolve) => {
      await this.modification_lock;
      resolve(this.updateRosterImpl(roster));
    });
    return this.modification_lock;
  }

  private async updateRosterImpl(roster: (Pick<ExamAssignmentInfo, "uniqname"> & Partial<Pick<ExamAssignmentInfo, "uniqname" | "name" | "window_uuid" | "force_open" | "duration_multiplier">>)[]) {
    
    const new_students : typeof roster = [];
    const existing_students : typeof roster = [];
    
    roster.forEach(student => {
      if (this.assigned_exams_by_uniqname.has(student.uniqname)) {
        existing_students.push(student);
      } else {
        new_students.push(student);
      }
    });


    // Update existing students
    await Promise.all(existing_students.map(async (student) => db_updateLiveExamAssignment(
      this.assigned_exams_by_uniqname.get(student.uniqname)!.exam_uuid,
      {
        name: student.name,
        window_uuid: student.window_uuid,
        force_open: student.force_open,
        duration_multiplier: student.duration_multiplier,
      }
    )));
    
    existing_students.forEach(student => {
      const student_assn = this.assigned_exams_by_uniqname.get(student.uniqname);
      Object.assign(assertExists(student_assn), student)
    });

    // Add new students
    const new_assns = await Promise.all(new_students.map(async (student) => db_createLiveExamAssignment(
      {
        exam_uuid: createStudentExamUuid({strategy: "uuidv5", v5_namespace: this.uuidv5_namespace}, student.uniqname, this.exam_id),
        exam_instance_uuid: this.exam_instance_uuid,
        uniqname: student.uniqname,
        name: student.name,
        student_email: MAKE_UMICH_EMAIL(student.uniqname),
        window_uuid: student.window_uuid,
        force_open: student.force_open,
        duration_multiplier: student.duration_multiplier,
      }
    )));

    new_assns.forEach(assn => {
      asMutable(this.assigned_exams).push(assn);
      this.assigned_exams_by_uniqname.set(assn.uniqname, assn);
    });

    // just run generation async, don't await it
    // this.generateExams(new_students.map(s => ({uniqname: s.uniqname, name: s.name ?? s.uniqname})));
    this.regenerateAllExams(); // TODO: Temporary fix is to run generation for all, since the ExamGenerator.writeAll() knocks out all files

    this.nextEpoch();
  }

  public getAssignedExams() : readonly ExamAssignmentInfo[] {
    return this.assigned_exams;
  }

  public getAssignedExamByUniqname(uniqname: string) : ExamAssignmentInfo | undefined {
    return this.assigned_exams_by_uniqname.get(uniqname);
  }

  public async updateAssignedExamByUuid(exam_uuid: string, fields: Partial<Pick<DB_Live_Exam_Assignments, "name" | "student_email" | "window_uuid" | "force_open" | "duration_multiplier">>) {
    const assn = this.assigned_exams.find(a => a.exam_uuid === exam_uuid);
    if (!assn) {
      throw new Error(`No such assigned exam ${exam_uuid}`);
    }
    const updated_assn = await db_updateLiveExamAssignment(exam_uuid, fields);
    Object.assign(assn, fields);
    this.nextEpoch();
    return updated_assn;
  }

  public async getSubmissions() {
    return db_getLiveExamSubmissions(this.exam_instance_uuid);
  }

  public async generateExams(students: readonly StudentInfo[]) {

    const worker = runGenerateWorker({
      exam_id: this.exam_id,
      exam_instance_uuid: this.exam_instance_uuid,
      students: students,
      uuidv5_namespace: this.uuidv5_namespace,
      randomization_seed: this.randomization_seed,
    });

    return this.tasks.workerTask(worker, "generate", `Preparing to generate ${students.length} exams...`);
  }

  public async regenerateAllExams() {
    return this.generateExams(this.getRoster());
  }

  public async gradeAllExams(run_request: RunGradingRequest) {

    const worker = runGradeWorker({
      exam_id: this.exam_id,
      grade_request: run_request,
      uuidv5_namespace: this.uuidv5_namespace,
      assigned_exams: this.assigned_exams,
    });

    return this.tasks.workerTask(worker, "grade", `Preparing to grade ${this.assigned_exams.length} exams for ${this.exam_id} instance ${this.exam_instance_uuid}...`);
  }

};

export interface ExamServerListener {
  onInstanceCreated(exam_instance: ExamInstanceServer) : void;
};

export class ExamServer {

  public readonly exam: Exam;
  
  public readonly exam_instances : readonly ExamInstanceServer[] = [];
  public readonly exam_instances_by_uuid: ReadonlyMap<string, ExamInstanceServer>;

  public readonly epoch: string;

  public readonly tasks: ServerTasks<ExamTask>;

  private readonly questionGradingServers: {
    [index: string]: QuestionGradingServer | undefined
  } = {};

  private readonly listeners: ExamServerListener[] = [];

  private constructor(exam: Exam, exam_instances: readonly ExamInstanceServer[], epoch: number, question_servers: readonly QuestionGradingServer[]) {
    this.exam = exam;
    this.exam_instances = exam_instances;
    this.exam_instances_by_uuid = new Map(exam_instances.map(ei => [ei.exam_instance_uuid, ei]));
    this.epoch = uuidv4();
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

  public addListener(listener: ExamServerListener) {
    this.listeners.push(listener);
  }

  public getEpoch() {
    return this.epoch;
  }

  private nextEpoch() {
    asMutable(this).epoch = uuidv4();
  }

  public getInfo() : ExamInfo {
    return {
      exam_id: this.exam.exam_id,
      exam_instances: this.exam_instances.map(ei => ei.getInfo()),
      epoch: this.epoch,
    };
  }
  
  public getExamInstances() {
    return this.exam_instances;
  }

  public getExamInstanceByUuid(exam_instance_uuid: string) {
    return this.exam_instances_by_uuid.get(exam_instance_uuid);
  }

  public async createExamInstance(
    name: string, duration_seconds: number,
    uuidv5_namespace?: string, randomization_seed?: string) {

    console.log("creating exam instance...".bgBlue);
    const db_instance = await db_createLiveExamInstance(
      this.exam.exam_id, name, duration_seconds,
      uuidv5_namespace, randomization_seed
    );
    console.log(db_instance)
    const exam_instance = await ExamInstanceServer.create(db_instance.exam_instance_uuid);
    asMutable(this.exam_instances).push(exam_instance);
    asMutable(this.exam_instances_by_uuid).set(exam_instance.exam_instance_uuid, exam_instance);
    this.listeners.forEach(listener => listener.onInstanceCreated(exam_instance));
    this.nextEpoch();
    return exam_instance;
    
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

  public async getLiveSubmissionByExamUuid(exam_uuid: string) {
    return db_getExamSubmissionByUuid(exam_uuid);
  }

  public async addSubmissions(files: readonly Express.Multer.File[]) {

    // Files will have been uploaded to "/uploads" and information about
    // each is in the files object. We'll pass this off to a worker
    // script to process each
    const worker = new Worker("./build/run/process_submissions.js", {
      workerData: {
        exam_id: this.exam.exam_id,
        files: files
      }
    });

    await this.tasks.workerTask(worker, "submissions", "Preparing to add submissions...");
    this.nextEpoch();

    // All question grading servers will need to reload new submission data from the DB
    await Promise.all(Object.values(this.questionGradingServers).map(qgs => qgs!.reloadGradingRecords()));
  }

  public async processDBSubmissions(exam_instance_uuid: string) {
    if (!this.exam_instances_by_uuid.has(exam_instance_uuid)) {
      throw new Error(`No such exam instance ${exam_instance_uuid}`);
    }
    const worker = new Worker("./build/run/process_db_submissions.js", {
      workerData: {
        exam_id: this.exam.exam_id,
        exam_instance_uuid: exam_instance_uuid,
      }
    });

    await this.tasks.workerTask(worker, "submissions", `Preparing to process submissions for${this.exam.exam_id} instance ${exam_instance_uuid}...`);
    this.nextEpoch();

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

    this.nextEpoch();

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