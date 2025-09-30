import axios from "axios";
import { AssignedExam, Exam, fillManifest, OpaqueExamSubmission, parseExamSpecification, TransparentExamManifest } from "examma-ray";
import { SubmittedExamRenderer } from "examma-ray/dist/core/exam_renderer";
import "examma-ray/dist/frontend/frontend-solution";
import queryString from "query-string";
import { ExamAssignmentInfo, ExamInfo, ExamInstanceInfo } from "../rest_types";
import { asMutable, assert } from "../util/util";
import { ExammaRayClient } from "./Application";

async function getExamInstanceInfo(client: ExammaRayClient, exam_id: string, exam_instance_uuid: string): Promise<ExamInstanceInfo> {
  return (await axios({
    url: `/api/exams/${exam_id}/instances/${exam_instance_uuid}`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    }
  })).data as ExamInstanceInfo;
}

async function getExam(client: ExammaRayClient, exam_id: string): Promise<Exam> {
  const exam_spec_response = await axios({
    url: `/api/exams/${exam_id}/spec`,
    method: "GET",
    data: {},
    headers: {
      'Authorization': 'bearer ' + client.getBearerToken()
    },
    responseType: "text",
    transformResponse: [v => v] // Avoid default transformation that attempts JSON parsing (so we can parse our special way below)
  });
  return Exam.create(parseExamSpecification(exam_spec_response.data as string));
}

export class LiveSubmissionViewer {
  
  public readonly client: ExammaRayClient;
  public readonly exam: Exam;
  public readonly exam_instance: ExamInstanceInfo;
  public readonly live_exam?: ExamAssignmentInfo;
  public readonly manifest?: TransparentExamManifest;
  
  private readonly renderer = new SubmittedExamRenderer();
  private readonly html_elem: JQuery;
  
  public static async create(exam_id: string, exam_instance_uuid: string) {
    
    const client = await ExammaRayClient.create();
    
    return new LiveSubmissionViewer(
      client,
      await getExamInstanceInfo(client, exam_id, exam_instance_uuid),
      await getExam(client, exam_id),
    );
  }

  public constructor(client: ExammaRayClient, exam_instance: ExamInstanceInfo, exam: Exam) {
    this.client = client;
    this.html_elem = $("#live-submission-container");
    this.exam_instance = exam_instance;
    this.exam = exam;

    this.initComponents();

    setInterval(() => this.refreshSubmission(), 5000);
  }

  private initComponents() {

    const attempt_student_load = async () => {
      
      try {
        const uniqname = $("#live-submission-viewer-uniqname-input").val();
        const assn = (await axios({
          url: `/api/exams/${this.exam_instance.exam_id}/instances/${this.exam_instance.exam_instance_uuid}/assigned_exams_by_uniqname/${uniqname}`,
          method: "GET",
          headers: {
              'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        })).data as ExamAssignmentInfo;

        this.setStudent(assn);
      }
      catch(e: unknown) {
        alert("Error loading student submission :(");
      }
    };

    $("#live-submission-viewer-view-button").on("click", attempt_student_load);
    $("#live-submission-viewer-uniqname-input").on("keypress", (e) => {
      if (e.key === "Enter") {
        attempt_student_load();
      }
    });

    $("#exam-name-status").text(`${this.exam_instance.name}`);
  }

  public async setStudent(live_exam: ExamAssignmentInfo) {
    asMutable(this).live_exam = live_exam;

    const manifest_response = await axios({
      url: `/api/assigned_exams/${live_exam.exam_uuid}/manifest`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    });
    asMutable(this).manifest = <TransparentExamManifest>manifest_response.data;

    await this.refreshSubmission();
  }

  public async refreshSubmission() {
    if (!this.live_exam || !this.manifest) {
      return;
    }
    
    const submission_response = await axios({
      url: `/api/assigned_exams/${this.live_exam.exam_uuid}/submission`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    });
    const submission = <OpaqueExamSubmission>submission_response.data.submission;

    // measure time to render
    const start = performance.now();
    console.log("Rendering submission for " + this.live_exam.uniqname);

    this.html_elem.html(
      this.renderer.renderBody(
        AssignedExam.createFromManifest(this.exam, fillManifest(this.manifest, submission))
      )
    );

    console.log("Rendered submission for " + this.live_exam.uniqname);
    console.log("Total time: " + (performance.now() - start) + "ms");
  }

}

async function main() {
  
  const qs = queryString.parse(location.search);
  const exam_id = qs["exam-id"];
  const exam_instance_uuid = qs["exam-instance-uuid"];
  assert(typeof exam_id === "string");
  assert(typeof exam_instance_uuid === "string");


  await LiveSubmissionViewer.create(exam_id, exam_instance_uuid);
}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}