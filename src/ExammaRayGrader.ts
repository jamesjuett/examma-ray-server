import { Exam } from "examma-ray";
import { readdirSync } from "fs";

export class ExammaRayGrader {

  public readonly exams: readonly Exam[]

  public constructor(exams: readonly Exam[]) {
    this.exams = exams;
  }

}