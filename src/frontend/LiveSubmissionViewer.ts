import axios from "axios";
import { AssignedExam, Exam } from "examma-ray";
import { SubmittedExamRenderer } from "examma-ray/dist/core/exam_renderer";
import { ExamSubmission, fillManifest, OpaqueExamSubmission, TransparentExamManifest, TrustedExamSubmission } from "examma-ray/dist/core/submissions";
import { asMutable } from "../util/util";
import { ExammaRayClient } from "./Application";
import { ExamAssignmentInfo } from "../rest_types";


export class LiveSubmissionViewer {
  
  public readonly client: ExammaRayClient;
  public readonly exam: Exam;
  public readonly live_exam?: ExamAssignmentInfo;
  public readonly manifest?: TransparentExamManifest;
  
  private readonly renderer = new SubmittedExamRenderer();
  private readonly html_elem: JQuery;
  
  public constructor(client: ExammaRayClient, exam: Exam, html_elem: JQuery) {
    this.client = client;
    this.html_elem = html_elem;

    this.exam = exam;

    setInterval(() => this.refreshSubmission(), 5000);
  }

  public async setStudent(live_exam: ExamAssignmentInfo) {
    asMutable(this).live_exam = live_exam;

    const manifest_response = await axios({
      url: `api/assigned_exams/${live_exam.exam_uuid}/manifest`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    });
    asMutable(this).manifest = <TransparentExamManifest>manifest_response.data;
  }

  public async refreshSubmission() {
    if (!this.live_exam || !this.manifest) {
      return;
    }
    
    const submission_response = await axios({
      url: `api/assigned_exams/${this.live_exam.exam_uuid}/submission`,
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