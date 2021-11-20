// import hljs from 'highlight.js/lib/core'
// import "highlight.js/styles/github.css";

import axios from "axios";
import { ExamSpecification } from "examma-ray";
import { IndexExammaRayGraderApplication } from "./Application";

// import 'katex/dist/katex.min.css';

async function main() {

  const app = new IndexExammaRayGraderApplication();
  await app.start();

  $(".file-input-form").on("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData();
    let files = (<HTMLInputElement>$("#file-input")[0]).files;
    if (files) {
      for(let i = 0; i < files.length; ++i) {
        if (i < 500) {
          formData.append("submissions", files[i]);
        }
        else {
          formData.append("fruit", files[i]);
        }
      }
    }
    console.log(formData);
    try {
      await axios({
        url: `api/exams/eecs280f21midterm/submissions`,
        method: "POST",
        data: formData,
        headers: {
          'Authorization': 'bearer ' + app.getBearerToken(),
        },
        maxBodyLength: 1000000000,
        maxContentLength: 1000000000,
      });
    }
    catch(e) {
      console.log(e);
    }
    console.log("done");
  })

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}