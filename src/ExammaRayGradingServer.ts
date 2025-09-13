import { ExamSpecification } from "examma-ray";
import { ExamServer } from "./ExamServer";

export class ExammaRayServer {

  private readonly exams_by_id: {
    [index: string]: ExamServer | undefined
  } = {};

  private constructor(exams: readonly ExamServer[]) {
    exams.forEach(exam => this.exams_by_id[exam.exam.exam_id] = exam);
  }

  public static async create(exam_specs: readonly ExamSpecification[]) {
    return new ExammaRayServer(
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