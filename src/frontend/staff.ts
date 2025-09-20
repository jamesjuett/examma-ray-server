import axios from "axios";
import { DB_Exams } from "knex/types/tables";
import { ExammaRayClient } from "./Application";
import { ExamInfo } from "../rest_types";

export class StaffExammaRayGraderApplication {

  public readonly client: ExammaRayClient;

  private constructor(client: ExammaRayClient) {
    this.client = client;
  }

  public static async create() {
    let app = new StaffExammaRayGraderApplication(await ExammaRayClient.create());
    await app.reloadExams();
    setInterval(() => app.reloadExams(), 30000)
    return app;
  }

  public async reloadExams() {
    const app = this;
    if (this.client.currentUser) {
      try {
  
        let exams_info = (await axios({
          url: `/api/exams`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        })).data as ExamInfo[];
  
        $(".examma-ray-exams-list").empty();
        exams_info.forEach(ex => {
          ex.exam_instances.forEach(ei => {
            $(".examma-ray-exams-list").append(`
              <li>
                <a href="dashboard.html?exam-id=${ei.exam_id}&exam-instance-uuid=${ei.exam_instance_uuid}">
                  ${ei.exam_id}: ${ei.name}
                </a>
              </li>
            `);
          })
        });

      }
      catch (e: unknown) {
        // no courses listed
      }
    }
    else {
      $(".examma-ray-exams-list").empty();
    }
  }
}

async function main() {

  const app = await StaffExammaRayGraderApplication.create();
  $("#create-exam-form").on("submit", async (e) => {
    e.preventDefault();
    let files = (<HTMLInputElement>$("#exam-spec-file-input")[0]).files;
    if (!files || !files[0]) {
      return;
    }
    const formData = new FormData();
    formData.append("exam_spec", files[0]);
    await axios({
      url: `/api/exams`,
      method: "POST",
      data: formData,
      headers: {
        'Authorization': 'bearer ' + app.client.getBearerToken(),
      },
    });

    app.reloadExams();
  });

  $("#run-generate-participation-csv-button").on("click", async () => {
    alert("hi");
    let response = await axios({
      url: `/run/participation`,
      method: "POST",
      headers: {
        'Authorization': 'bearer ' + app.client.getBearerToken()
      }
    });

    if (response.status !== 200) {
      alert(response.data);
    }
  });

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}