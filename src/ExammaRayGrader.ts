import { Exam, ExamSpecification } from "examma-ray";
import { readdirSync } from "fs";

export class ExammaRayGrader {

  public readonly exams: readonly Exam[];
  public readonly exams_by_id: {
    [index: string]: Exam | undefined
  } = {};

  public constructor(exam_specs: readonly ExamSpecification[]) {
    this.exams = exam_specs.map(spec => Exam.create(spec));
    this.exams.forEach(exam => this.exams_by_id[exam.exam_id] = exam);
  }

}