import axios from "axios";
import { DB_Exams, DB_Live_Exam_Assignments, DB_Live_Exam_Instances } from "knex/types/tables";
import { ExammaRayClient } from "./Application";

export class IndexExammaRayApplication {

  public readonly client: ExammaRayClient;

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
  
        let response = await axios({
          url: `student_api/exams`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        });
  
        $("#examma-ray-live-exams-list").empty();
        response.data.forEach((exam_info: DB_Live_Exam_Assignments & DB_Live_Exam_Instances) => {
          const exam_uuid = exam_info.exam_uuid;
          const uniqname = exam_info.uniqname;
          const exam_id = exam_info.exam_id;
          $("#examma-ray-live-exams-list").append(`
            <p>
              <a href="live/${exam_id}/exams/${uniqname}-${exam_uuid}.html">${exam_id}</a>
            </p>
          `);
        });

      }
      catch (e: unknown) {
        // no courses listed
      }
    }
    else {
      $("#examma-ray-live-exams-list").empty();
    }
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