// import hljs from 'highlight.js/lib/core'
// import "highlight.js/styles/github.css";

import { ExammaRayApplication } from "./Application";

// import 'katex/dist/katex.min.css';

function main() {

  const app = new ExammaRayApplication();
  app.start();

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}