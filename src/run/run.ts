import { StudentInfo } from "examma-ray";
import { ExamGeneratorOptions } from "examma-ray/dist/ExamGenerator";
import { ExamGraderOptions } from "examma-ray/dist/ExamGrader";
import { DB_Live_Exam_Assignments, DB_Live_Exam_Instances } from "knex/types/tables";
import { Worker } from "worker_threads";



export type WorkerData_Generate = {
  readonly exam_id: string,
  readonly exam_instance_uuid: string,
  readonly students: readonly StudentInfo[],
  readonly uuidv5_namespace: string,
  readonly randomization_seed: string,
}

export type WorkerData_ProcessSubmissions = {
  readonly exam_id: string,
  readonly files: readonly Express.Multer.File[],
}

export type WorkerData_ProcessDBSubmissions = {
  readonly exam_id: string,
  readonly exam_instance_uuid: string,
}



export type RunGradingRequest = {
  reports: boolean,
  curve: false,
} | {
  reports: boolean,
  curve: true,
  target_mean: number,
  target_stddev: number,
};

export type WorkerData_Grade = {
  readonly exam_id: string,
  readonly assigned_exams: readonly DB_Live_Exam_Assignments[],
  readonly grade_request: RunGradingRequest,
  readonly uuidv5_namespace: string,
};

export function runGenerateWorker(workerData: WorkerData_Generate) {
  return new Worker("./build/run/gen.js", {
    workerData: workerData
  });
}

export function runGradeWorker(workerData: WorkerData_Grade) {
  return new Worker("./build/run/grade.js", {
    workerData: workerData
  });
}