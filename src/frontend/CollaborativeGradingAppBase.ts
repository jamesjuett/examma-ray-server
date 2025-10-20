import axios from "axios";
import { AssignedQuestion, Question, QuestionSpecification, TransparentQuestionSubmission } from "examma-ray";
import { ActiveCollaborativeGrader, CollaborativeGraderKind, GraderState, GradingOperation, GradingRecords } from "../collaborative_grading/CollaborativeGradingTypes";
import { ExammaRayClient } from "./Application";
import { CollaborativeGradingApp, CollaborativeGradingClient } from "./CollaborativeGradingClient";
import { AssignedQuestionSkin, ExamInstanceInfo, QuestionSubmissionRecord } from "../rest_types";
import { assertExists } from "../util/util";
import { GradedResponseKind, Grader, GraderFor } from "examma-ray/dist/graders/QuestionGrader";



type CollaborativeGradingAppPageElements = {
  status?: JQuery,
  active_graders?: JQuery,
};

export type CollaborativeGradingAppBaseCtorArgs<CGKind extends CollaborativeGraderKind> = [
  ExammaRayClient, CollaborativeGradingClient, Question<GradedResponseKind<CGKind>>, GradingRecords<CGKind>,
  readonly ExamInstanceInfo[], readonly AssignedQuestionSkin[], readonly QuestionSubmissionRecord[]
]

export abstract class CollaborativeGradingAppBase<CGKind extends CollaborativeGraderKind> implements CollaborativeGradingApp<CGKind> {
  
  public readonly client: ExammaRayClient;
  public readonly cg_client: CollaborativeGradingClient<CGKind>;

  public readonly question: Question<GradedResponseKind<CGKind>>;
  public readonly skins: ReadonlyMap<string, AssignedQuestionSkin>;

  public readonly grading_records: GradingRecords<CGKind>;
  public readonly exam_instances: readonly ExamInstanceInfo[] = [];
  public readonly submission_records: readonly QuestionSubmissionRecord[];
  public readonly assigned_questions: readonly AssignedQuestion<GradedResponseKind<CGKind>>[];

  private page_elements: CollaborativeGradingAppPageElements;

  protected constructor(base_args: CollaborativeGradingAppBaseCtorArgs<CGKind>) {
    this.client = base_args[0];
    this.cg_client = base_args[1];
    this.question = base_args[2];
    this.grading_records = base_args[3];
    this.exam_instances = base_args[4];
    this.skins = new Map(base_args[5].map(skin => [skin.skin_id, skin]));
    this.submission_records = base_args[6];
    this.assigned_questions = this.submission_records.map(sub_record => AssignedQuestion.createFromSubmissionWithSkinOverride(
      this.question, {uniqname: sub_record.uniqname, name: ""}, sub_record.submission, assertExists(this.skins.get(sub_record.submission.skin_id))
    ) as AssignedQuestion<GradedResponseKind<CGKind>>);
    this
    this.page_elements = {
      status: $("#collaborative-grading-status"),
      active_graders: $("#collaborative-grading-active-graders"),
    };

    this.initComponents();
    this.cg_client.start(this);
  }

  protected static async createBaseArgs<CGKind extends CollaborativeGraderKind>(
    exam_id: string, grading_server_pk: number
  ) : Promise<CollaborativeGradingAppBaseCtorArgs<CGKind>> {
    const client = await ExammaRayClient.create();
    const cg_client = await CollaborativeGradingClient.create(client, grading_server_pk);
    const question_spec = await requestQuestionSpecification(client, exam_id, cg_client.question_id);
    const grading_records = await requestGradingRecords<CGKind>(client, grading_server_pk);
    const exam_instances = await requestExamInstancesInfo(client, grading_server_pk);
    const skins = await requestQuestionSkins(client, exam_id, cg_client.question_id);
    const submissions = await requestSubmissions(client, grading_server_pk);
    return [
      client, cg_client, Question.create(question_spec) as Question<GradedResponseKind<CGKind>>, grading_records, exam_instances, skins, submissions
    ] as const;
  }

  private initComponents() {
    this.page_elements.active_graders?.on("click", ".examma-ray-active-grader-avatar", (e) => {
      this.onAvatarClick($(e.currentTarget).data("client-uuid"));
    });
  }

  public abstract currentState(): GraderState<CGKind>;

  public abstract applyOperation(operation: GradingOperation<CGKind>): void;

  public abstract onOperationApplied(op: GradingOperation<CGKind>, client_uuid: string): void;

  public onPingSuccess(): void {
    this.page_elements.status?.html('<span class="label label-success"><i class="bi bi-cloud-check-fill"></i> Connected to Server</span>')
  }

  public onPingFailure(err: unknown): void {
    this.page_elements.status?.html('<span class="label label-danger"><i class="bi bi-cloud-slash-fill"></i> Error: Not Connected</span>');
  }

  protected onAvatarClick(client_uuid: string): void {
    // Derived classes may override
  }

  
  
  
};



export async function requestQuestionSpecification<CGKind extends CollaborativeGraderKind>(client: ExammaRayClient, exam_id: string, question_id: string) {
  const question_response = await axios({
    url: `/api/exams/${exam_id}/questions/${question_id}`,
    method: "GET",
    data: {},
    headers: {
        'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return question_response.data as QuestionSpecification;
}

export async function requestGradingRecords<CGKind extends CollaborativeGraderKind>(client: ExammaRayClient, grading_server_pk: number) {
  const records_response = await axios({
    url: `/api/collaborative_grading/${grading_server_pk}/grading_records`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return records_response.data as GradingRecords<CGKind>;
}

export async function requestExamInstancesInfo(client: ExammaRayClient, grading_server_pk: number) {
  const response = await axios({
    url: `/api/collaborative_grading/${grading_server_pk}/exam_instances`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return response.data as ExamInstanceInfo[];
}

export async function requestQuestionSkins(client: ExammaRayClient, exam_id: string, question_id: string) {
  const response = await axios({
    url: `/api/questions/${question_id}/assigned_skins`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return response.data as AssignedQuestionSkin[];
}

export async function requestSubmissions(client: ExammaRayClient, grading_server_pk: number) {
  const response = await axios({
    url: `/api/collaborative_grading/${grading_server_pk}/submissions`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  });
  return response.data as QuestionSubmissionRecord[];
}