import axios from "axios";
import { DB_Exams, DB_Live_Exam_Assignments, DB_Live_Exam_Instances } from "knex/types/tables";
import { ExammaRayClient } from "./Application";
import { ExamAssignmentInfo, ExamInstanceInfo, StudentExamsResponse, StudentFacingExamInfo } from "../rest_types";

export class IndexExammaRayApplication {

  public readonly client: ExammaRayClient;

  private next_open_close_timeout?: number;

  private constructor(client: ExammaRayClient) {
    this.client = client;
  }

  public static async create() {
    let app = new IndexExammaRayApplication(await ExammaRayClient.create());
    await app.reloadExams();
    setInterval(() => app.reloadExams(), 30000)
    return app;
  }

  public async reloadExams() {
    const app = this;
    if (this.client.currentUser) {
      try {
  
        let response = (await axios({
          url: `/student_api/exams`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        })).data as StudentExamsResponse;
  
        const server_now = response.now;
        
        $("#examma-ray-live-exams-list").empty();

        response.exams.forEach(exam_info => {
          const assigned_exam = exam_info.assigned_exam;
          const exam_instance = exam_info.exam_instance;
          const exam_window = exam_info.window;
          
          $("#examma-ray-live-exams-list").append(`
            <div class="col mb-3">
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title">${exam_instance.name}</h5>
                  <h6 class="card-subtitle mb-2 text-muted"><i class="bi bi-hourglass"></i>
                    ${assigned_exam.duration_multiplier === 1.0 
                      ? `${Math.floor(exam_instance.duration_seconds / 60)} minutes`
                      : `${Math.floor(exam_instance.duration_seconds * assigned_exam.duration_multiplier / 60)} minutes <span class="badge badge-info">${assigned_exam.duration_multiplier}x applied</span>`
                    }
                  </h6>
                  <p class="card-text">
                  ${exam_window
                    ? `Open: ${new Date(exam_window.open_time).toLocaleString()}<br />Close: ${new Date(exam_window.close_time).toLocaleString()}`
                    : "Open: <span class=\"text-danger\">No window assigned</span><br />Close: <span class=\"text-danger\">No window assigned</span>"}
                  </p>
                  ${renderExamButton(server_now, exam_info)}
                  
                </div>
              </div>
            </div>
          `)
        });
        
        const next_open_close = response.exams
          .flatMap(e => [e.window?.open_time, e.window?.close_time])
          .filter(t => t !== undefined)
          .map(t => new Date(t))
          .filter(t => t.getTime() > server_now) // future only
          .sort((a, b) => a.getTime() - b.getTime())[0];

        if (this.next_open_close_timeout !== undefined) {
          clearTimeout(this.next_open_close_timeout);
          delete this.next_open_close_timeout
        }
        if (next_open_close !== undefined) {
          this.next_open_close_timeout = window.setTimeout(() => {
            this.reloadExams();
            delete this.next_open_close_timeout
          }, next_open_close.getTime() - server_now + 1000);
        }

      }
      catch (e: unknown) {
        // no courses listed
        console.error("Error loading exams: ", e);
      }
    }
    else {
      $("#examma-ray-live-exams-list").empty();
    }
  }
}

function renderExamButton(server_now: number, exam_info: StudentFacingExamInfo) {
  if (exam_info.window === undefined) {
    return `<button class="btn btn-secondary" disabled><i class="bi bi-lock-fill"></i> Not Available</button>`;
  }

  // If forced open
  if (exam_info.assigned_exam.force_open) {
    if (exam_info.submission !== undefined) {
      return `<a href="/live/${exam_info.exam_instance.exam_id}/exams/${exam_info.assigned_exam.exam_uuid}.html" class="btn btn-success"><i class="bi bi-play-fill"></i> Continue</a>`;
    }
    else {
      return `<a href="/live/${exam_info.exam_instance.exam_id}/exams/${exam_info.assigned_exam.exam_uuid}.html" class="btn btn-primary"><i class="bi bi-unlock-fill"></i> Start</a>`;
    }
  }

  // If outside window
  if (server_now < new Date(exam_info.window.open_time).getTime()) {
    return `<button class="btn btn-secondary" disabled><i class="bi bi-lock-fill"></i> Not Yet Open</button>`;
  }
  else if (server_now > new Date(exam_info.window.close_time).getTime()) {
    if (exam_info.submission !== undefined) {
      return `<button class="btn btn-success" disabled><i class="bi bi-check-lg"></i> Submitted</button>`;
    }
    else {
      return `<button class="btn btn-danger" disabled><i class="bi bi-lock-fill"></i> Closed</button>`;
    }
  }

  // If duration has elapsed
  const duration_ms = exam_info.exam_instance.duration_seconds * exam_info.assigned_exam.duration_multiplier * 1000;
  const start_time = exam_info.assigned_exam.start_time ? new Date(exam_info.assigned_exam.start_time) : undefined;
  if (start_time && start_time.getTime() + duration_ms < server_now) {
    if (exam_info.submission !== undefined) {
      return `<button class="btn btn-success" disabled><i class="bi bi-check-lg"></i> Submitted</button>`;
    }
    else {
      return `<button class="btn btn-danger" disabled><i class="bi bi-lock-fill"></i> No Submission</button>`;
    }
  }

  if (exam_info.submission !== undefined) {
    return `<a href="/live/${exam_info.exam_instance.exam_id}/exams/${exam_info.assigned_exam.exam_uuid}.html" class="btn btn-success"><i class="bi bi-play-fill"></i> Continue</a>`;
  }
  else {
    return `<a href="/live/${exam_info.exam_instance.exam_id}/exams/${exam_info.assigned_exam.exam_uuid}.html" class="btn btn-primary"><i class="bi bi-unlock-fill"></i> Start</a>`;
  }
  
}

async function main() {

  const app = await IndexExammaRayApplication.create();
}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}