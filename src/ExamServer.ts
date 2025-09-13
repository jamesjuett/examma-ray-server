import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import { createStudentExamUuid } from "examma-ray/dist/core/assigned_exams";
import { rm } from "fs/promises";
import { DB_Live_Exam_Assignments, DB_Live_Exam_Instances } from "knex/types/tables";
import { v4 as uuidv4 } from "uuid";
import { Worker } from "worker_threads";
import { RunGradingRequest } from "./dashboard";
import { db_deleteManualGradingByExam, db_deleteManualGradingBySubmission } from "./db/db_code_grader";
import { db_deleteExam, db_deleteExamSubmissionByUuid, db_deleteExamSubmissions, db_getExamSubmissionByUuid } from "./db/db_exams";
import { db_createLiveExamAssignment, db_getLiveExamAssignmentsByInstance, db_getLiveExamInstanceByUuid, db_getLiveExamInstancesByExamId } from "./db/db_live";
import { ActiveExamGraders } from "./manual_grading";
import { QuestionGradingServer } from "./QuestionGradingServer";
import { runGenerateWorker, runGradeWorker } from "./run/run";
import { ServerTasks } from "./ServerTasks";
import { asMutable, assertExists } from "./util/util";

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

  public readonly assigned_exams: readonly DB_Live_Exam_Assignments[];
  public readonly assigned_exams_by_uniqname: Map<string, Readonly<DB_Live_Exam_Assignments>>;

  private readonly uniqnames_pending_exam_assignment: Set<string> = new Set();

  private constructor(db_instance: DB_Live_Exam_Instances, db_assignments: readonly DB_Live_Exam_Assignments[]) {
    this.exam_instance_uuid = db_instance.exam_instance_uuid;
    this.exam_id = db_instance.exam_id;
    this.duration_seconds = db_instance.duration_seconds;
    this.uuidv5_namespace = db_instance.uuidv5_namespace;
    this.randomization_seed = db_instance.randomization_seed;
    this.assigned_exams = db_assignments;
    this.assigned_exams_by_uniqname = new Map(db_assignments.map(assgn => [assgn.uniqname, assgn]));
    
    this.epoch = uuidv4();
    this.tasks = new ServerTasks();
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

  public getRoster() : StudentInfo[] {
    return this.assigned_exams.map(assn => ({
      uniqname: assn.uniqname,
      name: assn.name ?? assn.uniqname,
    }));
  }

  public async addToRoster(roster: StudentInfo[]) {
    // Add all students in the roster to the exam assignments if they aren't already there
    const new_students = roster.filter(student =>
      !this.assigned_exams_by_uniqname.has(student.uniqname)
      && !this.uniqnames_pending_exam_assignment.has(student.uniqname)
    );

    new_students.forEach(student => this.uniqnames_pending_exam_assignment.add(student.uniqname));

    // Prior to this point, things run synchronously/atomically and will make sure other, interleaved
    // calls to addToRoster() won't try to add the same student multiple times.

    const new_assns = await Promise.all(new_students.map(async (student) => db_createLiveExamAssignment(
      createStudentExamUuid({strategy: "uuidv5", v5_namespace: this.uuidv5_namespace}, student, this.exam_id),
      this.exam_instance_uuid,
      student.uniqname,
      student.name,
      MAKE_UMICH_EMAIL(student.uniqname),
    )));

    await this.generateExams(new_students);

    // This is also synchronous/atomic
    new_assns.forEach(assn => {
      this.uniqnames_pending_exam_assignment.delete(assn.uniqname);
      asMutable(this.assigned_exams).push(assn);
    });
    
    this.nextEpoch();
  };

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

  public async gradeExams(run_request: RunGradingRequest) {

    const worker = runGradeWorker({
      exam_id: this.exam_id,
      grade_request: run_request,
      uuidv5_namespace: this.uuidv5_namespace,
      assigned_exams: this.assigned_exams,
    });

    return this.tasks.workerTask(worker, "grade", `Preparing to grade ${this.assigned_exams.length} exams for ${this.exam_id} instance ${this.exam_instance_uuid}...`);
  }

};


export class ExamServer {

  public readonly exam: Exam;
  
  public readonly exam_instances : readonly ExamInstanceServer[] = [];
  public readonly exam_instances_by_uuid: {
    [index: string]: ExamInstanceServer | undefined
  };

  public readonly epoch: string;

  public readonly tasks: ServerTasks<ExamTask>;

  private readonly questionGradingServers: {
    [index: string]: QuestionGradingServer | undefined
  } = {};

  private constructor(exam: Exam, exam_instances: readonly ExamInstanceServer[], epoch: number, question_servers: readonly QuestionGradingServer[]) {
    this.exam = exam;
    this.exam_instances = exam_instances;
    this.exam_instances_by_uuid = Object.fromEntries(this.exam_instances.map(ei => [ei.exam_instance_uuid, ei]));
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

  public getEpoch() {
    return this.epoch;
  }

  private nextEpoch() {
    asMutable(this).epoch = uuidv4();
  }
  
  public getExamInstances() {
    return this.exam_instances;
  }

  public getExamInstanceByUuid(exam_instance_uuid: string) {
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