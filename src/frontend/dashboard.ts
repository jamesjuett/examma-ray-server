import axios from "axios";
import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import queryString from "query-string";
import { ExamSubmissionRecord } from "../dashboard";
import { ExamTaskStatus } from "../ExammaRayGradingServer";
import { asMutable, assert } from "../util/util";
import { ExammaRayGraderClient } from "./Application";



export class DashboardExammaRayGraderApplication {

  public readonly client: ExammaRayGraderClient;

  public readonly exam_id: string;
  public readonly exam?: Exam;
  
  private exam_epoch?: number;

  private constructor(client: ExammaRayGraderClient, exam_id: string) {
    this.client = client;
    this.exam_id = exam_id;

    this.initComponents();

    this.sendPing();
    setInterval(() => this.sendPing(), 5000);
    setInterval(() => this.checkTaskStatus(), 2000);
  }

  public static async create(exam_id: string) {
    return new DashboardExammaRayGraderApplication(
      await ExammaRayGraderClient.create(),
      exam_id
    );
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
          'Authorization': 'bearer ' + this.client.getBearerToken(),
        },
      });

      $("#upload-roster-modal").modal("hide");
    });
  }

  private async checkTaskStatus() {

    const task_status_response = await axios({
      url: `api/exams/${this.exam_id}/tasks`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    });
    const task_status = <ExamTaskStatus>task_status_response.data;

    $("#examma-ray-task-status").html(JSON.stringify(task_status, null, 2));
    
  }

  private async sendPing() {

    const epoch_response = await axios({
      url: `api/exams/${this.exam_id}/epoch`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    });
    const current_epoch = <number>epoch_response.data.epoch;

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
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });
      const exam_spec = <ExamSpecification>exam_spec_response.data;

      asMutable(this).exam = Exam.create(exam_spec);

      const submissions_response = await axios({
        url: `api/exams/${this.exam_id}/submissions`,
        method: "GET",
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });
      const submissions = <ExamSubmissionRecord[]>submissions_response.data;

      const roster_response = await axios({
        url: `api/exams/${this.exam_id}/roster`,
        method: "GET",
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });
      const roster = <StudentInfo[]>roster_response.data;

      let students : {
        [index: string] : {
          uniqname: string,
          name: string,
          submission?: ExamSubmissionRecord
        }
      } = {};
      
      roster.forEach(s => students[s.uniqname] = {
        uniqname: s.uniqname,
        name: s.name
      });

      submissions.forEach(s => students[s.uniqname].submission = s);

      $(".examma-ray-students-list").html(Object.values(students).sort((a,b) => a.uniqname.localeCompare(b.uniqname)).map(s => `<li>
        ${s.uniqname}
        ${s.submission
          ? `
            <a class="btn btn-sm btn-primary" href="out/${this.exam?.exam_id}/exams/${s.uniqname}-${s.submission.uuid}.html">Exam</a>
          `
          : "[no submission]"
      
        }
      </li>`).join(""));
      
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
        'Authorization': 'bearer ' + this.client.getBearerToken(),
      },
    });
  }
}

async function main() {
  
  const qs = queryString.parse(location.search);
  const EXAM_ID = qs["exam-id"];
  assert(typeof EXAM_ID === "string");


  const app = await DashboardExammaRayGraderApplication.create(EXAM_ID);

  
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