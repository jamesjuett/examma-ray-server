import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import { readdirSync } from "fs";
import { copyFile, readFile } from "fs/promises";
import { JwtUserInfo } from "./auth/jwt_auth";
import { ActiveGraders, ManualGradingPingRequest, ManualGradingPingResponse } from "./manual_grading";
import { asMutable } from "./util/util";
import { Worker } from "worker_threads";
import { ExamGeneratorSpecification } from "examma-ray/dist/ExamGenerator";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { db_getExamEpoch, db_nextExamEpoch } from "./db/db_exams";
import { WorkerData_Generate } from "./run/types";

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

  public constructor(exam_spec: ExamSpecification) {
    this.exam = Exam.create(exam_spec);
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
}


export class ExammaRayGradingServer {

  public readonly exams: readonly ServerExam[];
  public readonly exams_by_id: {
    [index: string]: ServerExam | undefined
  } = {};

  public readonly active_graders: ActiveGraders = {};
  private next_active_graders: ActiveGraders = {};

  public constructor(exam_specs: readonly ExamSpecification[]) {
    this.exams = exam_specs.map(spec => new ServerExam(spec));
    this.exams.forEach(exam => this.exams_by_id[exam.exam.exam_id] = exam);

    setInterval(() => {
      asMutable(this).active_graders = this.next_active_graders;
      this.next_active_graders = {};
    }, GRADER_IDLE_THRESHOLD);
  }

  public loadExam(exam_spec: ExamSpecification) {
    const newExam = new ServerExam(exam_spec);

    let existingIndex = this.exams.findIndex(ex => ex.exam.exam_id === newExam.exam.exam_id);
    if (existingIndex !== -1) {
      asMutable(this.exams)[existingIndex] = newExam;
    }
    else {
      asMutable(this.exams).push(newExam);
    }

    this.exams_by_id[newExam.exam.exam_id] = newExam;
  }

  public receiveManualGradingPing(email: string, ping: ManualGradingPingRequest) {
    (this.active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
    (this.next_active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
  }

  public pingResponse(question_id: string) : ManualGradingPingResponse {
    return {
      question_id: question_id,
      group_epoch: "TODO",
      rubric_epoch: "TODO",
      active_graders: this.active_graders
    }
  }

}