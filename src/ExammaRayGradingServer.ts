import { ExamSpecification } from "examma-ray";
import { ExamInstanceServer, ExamServer, ExamServerListener } from "./ExamServer";
import { asMutable } from "./util/util";

export class ExammaRayServer implements ExamServerListener {

  private readonly exams_by_id: {
    [index: string]: ExamServer | undefined
  } = {};

  public readonly exam_instances_by_uuid: ReadonlyMap<string, ExamInstanceServer> = new Map();

  private constructor(exams: readonly ExamServer[]) {
    exams.forEach(exam => {
      this.exams_by_id[exam.exam.exam_id] = exam;
      exam.getExamInstances().forEach(instance => {
        asMutable(this.exam_instances_by_uuid).set(instance.exam_instance_uuid, instance);
      })
      exam.addListener(this);
    });
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

  public getAllExamsInfo() {
    return Object.values(this.exams_by_id).map(exam => exam!.getInfo());
  }

  public onInstanceCreated(exam_instance: ExamInstanceServer) {
    asMutable(this.exam_instances_by_uuid).set(exam_instance.exam_instance_uuid, exam_instance);
  }

}