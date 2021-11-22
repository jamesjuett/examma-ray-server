import { Exam, ExamSpecification } from "examma-ray";
import { readdirSync } from "fs";
import { JwtUserInfo } from "./auth/jwt_auth";
import { ActiveGraders, ManualGradingPingRequest, ManualGradingPingResponse } from "./manual_grading";
import { asMutable } from "./util/util";

const GRADER_IDLE_THRESHOLD = 10000; // ms



export class ExammaRayGradingServer {

  public readonly exams: readonly Exam[];
  public readonly exams_by_id: {
    [index: string]: Exam | undefined
  } = {};

  public readonly active_graders: ActiveGraders = {};
  private next_active_graders: ActiveGraders = {};

  public constructor(exam_specs: readonly ExamSpecification[]) {
    this.exams = exam_specs.map(spec => Exam.create(spec));
    this.exams.forEach(exam => this.exams_by_id[exam.exam_id] = exam);

    setInterval(() => {
      asMutable(this).active_graders = this.next_active_graders;
      this.next_active_graders = {};
    }, GRADER_IDLE_THRESHOLD);
  }

  public loadExam(exam_spec: ExamSpecification) {
    const newExam = Exam.create(exam_spec);

    let existingIndex = this.exams.findIndex(ex => ex.exam_id === newExam.exam_id);
    if (existingIndex !== -1) {
      asMutable(this.exams)[existingIndex] = newExam;
    }
    else {
      asMutable(this.exams).push(newExam);
    }

    this.exams_by_id[newExam.exam_id] = newExam;
  }

  public receiveManualGradingPing(email: string, ping: ManualGradingPingRequest) {
    (this.active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
    (this.next_active_graders[ping.question_id] ??= {graders: {}}).graders[ping.client_uuid] = {group_uuid: ping.group_uuid, email: email};
  }

  public pingResponse(question_id: string) : ManualGradingPingResponse {
    return {
      question_id: question_id,
      group_epoch: "TODO",
      rubric_epoch: "TODO",
      active_graders: this.active_graders
    }
  }

}