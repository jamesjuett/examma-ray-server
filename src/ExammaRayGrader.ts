import { Exam, ExamSpecification } from "examma-ray";
import { readdirSync } from "fs";

export class ExammaRayGrader {

  public readonly exam_specs: readonly ExamSpecification[];
  public readonly exam_specs_by_id: {
    [index: string]: ExamSpecification | undefined
  } = {};

  public constructor(exam_specs: readonly ExamSpecification[]) {
    this.exam_specs = exam_specs;
    exam_specs.forEach(spec => this.exam_specs_by_id[spec.exam_id] = spec);
  }

}