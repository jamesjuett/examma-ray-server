// import hljs from 'highlight.js/lib/core'
// import "highlight.js/styles/github.css";

import axios from "axios";
import { ExamSpecification } from "examma-ray";
import { IndexExammaRayGraderApplication } from "./Application";

// import 'katex/dist/katex.min.css';

function main() {

  const app = new IndexExammaRayGraderApplication();
  app.start();
  
  reloadExams(app);

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}



async function reloadExams(app: IndexExammaRayGraderApplication) {
    
  if (app.currentUser) {
    try {

      let response = await axios({
        url: `api/exams`,
        method: "GET",
        data: {},
        headers: {
          'Authorization': 'bearer ' + app.getBearerToken()
        }
      });

      response.data.forEach((exam_spec: Omit<ExamSpecification, "sections">) => {
        const exam_id = exam_spec.exam_id;
        $(".examma-ray-exams-list").append(`
          <li>
            <a href="out/${exam_id}/graded/overview.html">${exam_id}: ${exam_spec.title}</a>
            <button class="btn btn-success examma-ray-run-grading-button" data-exam-id="${exam_id}">Run Grading</button>
            <button class="btn btn-success examma-ray-run-reports-button" data-exam-id="${exam_id}">Generate Grading Reports</button>
          </li>
        `);
        $(".examma-ray-run-grading-button").on("click", async function() {
          let response = await axios({
            url: `run/grade/${$(this).data("exam-id")}`,
            method: "POST",
            data: {},
            headers: {
                'Authorization': 'bearer ' + app.getBearerToken()
            }
          });
          alert(JSON.stringify(response.data));
        });

        $(".examma-ray-run-reports-button").on("click", async function() {
          let response = await axios({
            url: `run/reports/${$(this).data("exam-id")}`,
            method: "POST",
            data: {},
            headers: {
                'Authorization': 'bearer ' + app.getBearerToken()
            }
          });
          alert(JSON.stringify(response.data));
        });

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