import { StudentInfo } from "examma-ray";
import { ExamGeneratorSpecification } from "examma-ray/dist/ExamGenerator";


export type WorkerData_Generate = {
  readonly exam_id: string,
  readonly roster: readonly StudentInfo[],
  readonly gen_spec: ExamGeneratorSpecification
}