import { ExamSpecification } from "examma-ray";
import { ExamInstanceServer, ExamInstanceServerListener, ExamServer, ExamServerListener } from "./ExamServer";
import { ExamAssignmentInfo } from "./rest_types";
import { asMutable } from "./util/util";

export class ExammaRayServer implements ExamServerListener, ExamInstanceServerListener {

  public readonly examServersById: ReadonlyMap<string, ExamServer> = new Map();

  public readonly examInstancesByUuid: ReadonlyMap<string, ExamInstanceServer> = new Map();

  // Student-facing routes are keyed only by assigned exam uuid, so we index those globally.
  public readonly examInstancesByAssignedExamUuid: ReadonlyMap<string, ExamInstanceServer> = new Map();

  private constructor(exams: readonly ExamServer[]) {
    exams.forEach(exam => {
      asMutable(this.examServersById).set(exam.exam.exam_id, exam);
      exam.getExamInstances().forEach(instance => this.registerExamInstance(instance));
      exam.addListener(this);
    });
  }

  private registerExamInstance(exam_instance: ExamInstanceServer) {
    asMutable(this.examInstancesByUuid).set(exam_instance.exam_instance_uuid, exam_instance);
    this.onAssignedExamsAdded(exam_instance, exam_instance.getAssignedExams());
    exam_instance.addListener(this);
  }

  public static async create(exam_specs: readonly ExamSpecification[]) {
    return new ExammaRayServer(
      await Promise.all(exam_specs.map(spec => ExamServer.create(spec)))
    )
  }

  public getExamServer(exam_id: string) {
    return this.examServersById.get(exam_id);
  }

  public getExamInstanceByAssignedExamUuid(exam_uuid: string) {
    return this.examInstancesByAssignedExamUuid.get(exam_uuid);
  }

  public getAssignedExamByUuid(exam_uuid: string) {
    const exam_instance = this.examInstancesByAssignedExamUuid.get(exam_uuid);
    const assigned_exam = exam_instance?.getAssignedExamByUuid(exam_uuid);
    return exam_instance && assigned_exam ? { exam_instance, assigned_exam } : undefined;
  }

  public async loadExamServer(exam_spec: ExamSpecification) {
    const exam_server = await ExamServer.create(exam_spec);
    asMutable(this.examServersById).set(exam_spec.exam_id, exam_server);
    exam_server.getExamInstances().forEach(instance => this.registerExamInstance(instance));
    exam_server.addListener(this);
    return exam_server;
  }

  public unloadExamServer(exam_id: string) {
    const exam_server = asMutable(this.examServersById).get(exam_id);
    asMutable(this.examServersById).delete(exam_id);
    exam_server?.getExamInstances().forEach(instance => {
      asMutable(this.examInstancesByUuid).delete(instance.exam_instance_uuid);
      instance.getAssignedExams().forEach(
        assn => asMutable(this.examInstancesByAssignedExamUuid).delete(assn.exam_uuid)
      );
    });
    return exam_server;
  }

  public getAllExamsInfo() {
    return this.examServersById.values().map(exam => exam.getInfo()).toArray();
  }

  public onInstanceCreated(exam_instance: ExamInstanceServer) {
    this.registerExamInstance(exam_instance);
  }

  public onAssignedExamsAdded(exam_instance: ExamInstanceServer, assigned_exams: readonly ExamAssignmentInfo[]) {
    assigned_exams.forEach(
      assn => asMutable(this.examInstancesByAssignedExamUuid).set(assn.exam_uuid, exam_instance)
    );
  }

}