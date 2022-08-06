// import hljs from 'highlight.js/lib/core'
// import "highlight.js/styles/github.css";

import axios from "axios";
import { ExamSpecification } from "examma-ray";
import { read } from "fs";
import { DB_Exams } from "knex/types/tables";
import { ExammaRayGraderClient } from "./Application";

// import 'katex/dist/katex.min.css';



export class IndexExammaRayGraderApplication {

  public readonly client: ExammaRayGraderClient;

  private constructor(client: ExammaRayGraderClient) {
    this.client = client;
  }

  public static async create() {
    let app = new IndexExammaRayGraderApplication(await ExammaRayGraderClient.create());
    await app.reloadExams();
    setInterval(() => app.reloadExams(), 30000)
    return app;
  }

  public async reloadExams() {
    const app = this;
    if (this.client.currentUser) {
      try {
  
        let response = await axios({
          url: `api/exams`,
          method: "GET",
          data: {},
          headers: {
            'Authorization': 'bearer ' + this.client.getBearerToken()
          }
        });
  
        $(".examma-ray-exams-list").empty();
        response.data.forEach((exam_info: DB_Exams) => {
          const exam_id = exam_info.exam_id;
          $(".examma-ray-exams-list").append(`
            <li>
              <a href="dashboard.html?exam-id=${exam_id}">${exam_id}</a>
            </li>
          `);

         
  
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

  const app = await IndexExammaRayGraderApplication.create();
  $("#create-exam-form").on("submit", async (e) => {
    e.preventDefault();
    let files = (<HTMLInputElement>$("#exam-spec-file-input")[0]).files;
    if (!files || !files[0]) {
      return;
    }
    const formData = new FormData();
    formData.append("exam_spec", files[0]);
    await axios({
      url: `api/exams`,
      method: "POST",
      data: formData,
      headers: {
        'Authorization': 'bearer ' + app.client.getBearerToken(),
      },
    });

    app.reloadExams();
  });

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}