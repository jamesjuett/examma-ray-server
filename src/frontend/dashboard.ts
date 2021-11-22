import axios from "axios";
import { Exam, ExamSpecification } from "examma-ray";
import queryString from "query-string";
import { ExamSubmissionRecord } from "../dashboard";
import { asMutable, assert } from "../util/util";
import { ExammaGraderRayApplication } from "./Application";



export class DashboardExammaRayGraderApplication extends ExammaGraderRayApplication {

  public readonly exam_id: string;
  public readonly exam?: Exam;
  
  private exam_epoch?: string;

  public constructor(exam_id: string) {
    super();
    this.exam_id = exam_id;

    this.initComponents();
  }

  private initComponents() {
    $(".examma-ray-exam-id").html(this.exam_id);

    $("#upload-roster-modal-button").on("click", async () => {
      
      let files = (<HTMLInputElement>$("#upload-roster-file-input")[0]).files;
      if (!files || !files[0]) {
        return;
      }
      const formData = new FormData();
      formData.append("roster", files[0]);
      await axios({
        url: `api/exams/${this.exam_id}/roster`,
        method: "put",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + this.getBearerToken(),
        },
      });

      $("#upload-roster-modal").modal("hide");
    });
  }

  protected async onStart() {
    this.sendPing();
    setInterval(() => this.sendPing(), 5000);
  }

  private async sendPing() {

    const ping_exam_id = this.exam_id;

    const epoch_response = await axios({
      url: `api/exams/${ping_exam_id}/epoch`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.getBearerToken()
      }
    });
    const current_epoch = <string>epoch_response.data;

    if (this.exam_epoch !== current_epoch) {
      this.exam_epoch = current_epoch;
      this.reloadExam();
    }
    
  }


  public async reloadExam() {

    try {

      const exam_spec_response = await axios({
        url: `api/exams/${this.exam_id}`,
        method: "GET",
        data: {},
        headers: {
            'Authorization': 'bearer ' + this.getBearerToken()
        }
      });
      const exam_spec = <ExamSpecification>exam_spec_response.data;

      asMutable(this).exam = Exam.create(exam_spec);

      const submissions_response = await axios({
        url: `api/exams/${this.exam_id}/submissions`,
        method: "GET",
        data: {},
        headers: {
            'Authorization': 'bearer ' + this.getBearerToken()
        }
      });
      const submissions = <ExamSubmissionRecord[]>submissions_response.data;

      $(".examma-ray-submissions-list").html(submissions.map(sub => `<li>${sub.uniqname}</li>`).join(""));
      
    }
    catch(e: unknown) {
      alert("Error loading question :(");
    }
  }

  public async addSubmissions(files: FileList) {
    if (!this.exam) {
      return;
    }
    
    const formData = new FormData();
    if (files) {
      for(let i = 0; i < files.length; ++i) {
        formData.append("submissions", files[i]);
      }
    }

    await axios({
      url: `api/exams/${this.exam.exam_id}/submissions`,
      method: "POST",
      data: formData,
      headers: {
        'Authorization': 'bearer ' + this.getBearerToken(),
      },
    });
  }
}

function main() {
  
  const qs = queryString.parse(location.search);
  const EXAM_ID = qs["exam-id"];
  assert(typeof EXAM_ID === "string");


  const app = new DashboardExammaRayGraderApplication(EXAM_ID);
  app.start();

  
  $("#submissions-file-input-form").on("submit", async (e) => {
    e.preventDefault();
    let files = (<HTMLInputElement>$("#submissions-file-input")[0]).files;
    if (files) {
      app.addSubmissions(files);
    }
  });
}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}