import { ExamSpecification } from "examma-ray";
import { ExamInstanceServer, ExamServer, ExamServerListener } from "./ExamServer";
import { asMutable } from "./util/util";

export class ExammaRayServer implements ExamServerListener {

  public readonly examServersById: ReadonlyMap<string, ExamServer> = new Map();

  public readonly examInstancesByUuid: ReadonlyMap<string, ExamInstanceServer> = new Map();

  private constructor(exams: readonly ExamServer[]) {
    exams.forEach(exam => {
      asMutable(this.examServersById).set(exam.exam.exam_id, exam);
      exam.getExamInstances().forEach(instance => {
        asMutable(this.examInstancesByUuid).set(instance.exam_instance_uuid, instance);
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
    return this.examServersById.get(exam_id);
  }

  public async loadExamServer(exam_spec: ExamSpecification) {
    const exam_server = await ExamServer.create(exam_spec);
    asMutable(this.examServersById).set(exam_spec.exam_id, exam_server);
    return exam_server;
  }

  public unloadExamServer(exam_id: string) {
    const exam_server = asMutable(this.examServersById).get(exam_id);
    asMutable(this.examServersById).delete(exam_id);
    return exam_server;
  }

  public getAllExamsInfo() {
    return this.examServersById.values().map(exam => exam.getInfo()).toArray();
  }

  public onInstanceCreated(exam_instance: ExamInstanceServer) {
    asMutable(this.examInstancesByUuid).set(exam_instance.exam_instance_uuid, exam_instance);
  }

}