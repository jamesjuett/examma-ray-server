import { StudentInfo } from "examma-ray";
import { ExamGeneratorSpecification } from "examma-ray/dist/ExamGenerator";
import { DB_Live_Exam_Instances } from "knex/types/tables";



export type WorkerData_Generate = {
  readonly exam_id: string,
  readonly exam_instance_uuid: string,
  readonly students: readonly StudentInfo[],
  readonly gen_spec: ExamGeneratorSpecification,
}

export type WorkerData_ProcessSubmissions = {
  readonly exam_id: string,
  readonly files: readonly Express.Multer.File[],
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
  exam_instance: DB_Live_Exam_Instances,
  grade_request: RunGradingRequest,
};