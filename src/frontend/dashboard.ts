import avatar from "animal-avatar-generator";
import axios from "axios";
import { Exam, ExamSpecification, StudentInfo } from "examma-ray";
import queryString from "query-string";
import { ExamPingResponse, ExamSubmissionRecord, RunGradingRequest } from "../dashboard";
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
    $("#examma-ray-grading-overview-link").attr("href", `out/${this.exam_id}/graded/overview.html`);

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

    
    $("#run-grading-submit-button").on("click", async () => {
      const request: RunGradingRequest = {
        reports: $("#run-grading-input-reports").is(":checked"),
        curve: $("#run-grading-input-curve").is(":checked"),
        target_mean: parseFloat(""+$("#run-grading-input-curve-target-mean").val()),
        target_stddev: parseFloat(""+$("#run-grading-input-curve-target-stddev").val()),
      };

      let response = await axios({
        url: `run/grade/${this.exam_id}`,
        method: "POST",
        data: request,
        headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
        }
      });

      $("#run-grading-modal").modal("hide");
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

    $("#examma-ray-task-status").html(`
      <table>
        ${Object.entries(task_status).map(([task, status]) => `
          <tr>
            <td><span class="badge badge-primary">${task}</span></td>
            <td>${status}</td>
          </tr>
        `).join("")
        }
      </table>
    `);
    
  }

  private async sendPing() {

    const ping_response = <ExamPingResponse>(await axios({
      url: `api/exams/${this.exam_id}/ping`,
      method: "GET",
      headers: {
          'Authorization': 'bearer ' + this.client.getBearerToken()
      }
    })).data;
    const current_epoch = ping_response.epoch;

    if (this.exam_epoch !== current_epoch) {
      this.exam_epoch = current_epoch;
      await this.reloadExam();
    }
    
    $(".question-grader-avatars").empty();
    Object.keys(ping_response.active_graders).forEach(question_id => {
      let questionElem = $(`#question-grader-avatars-${question_id}`);
      Object.values(ping_response.active_graders[question_id].graders).forEach(grader => {
        $(`<div style="display: inline-block;" data-toggle="tooltip" data-placement="bottom" title="${grader.email}">
          ${avatar(grader.email, { size: 30 })}
        </div>`).appendTo(questionElem);
      });
    });
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
      assert(this.exam);

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
            <a class="btn btn-sm btn-primary" href="out/${this.exam?.exam_id}/submitted/${s.uniqname}-${this.exam?.exam_id}.html">Exam</a>
            <a class="btn btn-sm btn-danger examma-ray-delete-submission-button" data-submission-uuid="${s.submission.uuid}">Delete</a>
          `
          : "[no submission]"
        }
      </li>`).join(""));

      const self = this;
      $(".examma-ray-students-list .examma-ray-delete-submission-button").on("click", async function() {

        if (!self.exam) { return; }

        await axios({
          url: `api/exams/${self.exam.exam_id}/submissions/${$(this).data("submission-uuid")}`,
          method: "DELETE",
          headers: {
            'Authorization': 'bearer ' + self.client.getBearerToken(),
          },
        });

        self.sendPing();
      });

      const forced_code_grader = [
        "secret_message",
        "cstring_interleave",
      ];

      $("#examma-ray-question-grading-list").html(
        this.exam!.allQuestions
          .filter(q => q.response.default_grader?.grader_kind === "manual_code_writing" || forced_code_grader.indexOf(q.question_id) !== -1)
          .map(q => `<li><a href="manual-code-grader.html?exam_id=${this.exam!.exam_id}&question_id=${q.question_id}">${q.question_id}</a><span id="question-grader-avatars-${q.question_id}" class="question-grader-avatars"></span></li>`).join("")
        + 
        this.exam!.allQuestions
        .filter(q => q.response.default_grader?.grader_kind === "manual_generic" && !(forced_code_grader.indexOf(q.question_id) !== -1))
        .map(q => `<li><a href="manual-generic-grader.html?exam_id=${this.exam!.exam_id}&question_id=${q.question_id}">${q.question_id}</a><span id="question-grader-avatars-${q.question_id}" class="question-grader-avatars"></span></li>`).join("")

      );
        
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