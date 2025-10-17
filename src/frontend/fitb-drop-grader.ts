import queryString from "query-string";
import { assert } from "../util/util";

import "highlight.js/styles/github.css";
import 'katex/dist/katex.min.css';
import "examma-ray/dist/frontend/frontend.css";
import "./fitb-drop-grader.css";
import { FITBDropGradingApp } from "./FITBDropGradingApp";


async function main() {

  
  const qs = queryString.parse(location.search);
  const EXAM_ID = qs["exam_id"];
  const QUESTION_SERVER_PK = qs["question_server_pk"];
  assert(typeof EXAM_ID === "string");
  assert(typeof QUESTION_SERVER_PK === "string");
  const app = await FITBDropGradingApp.create(EXAM_ID, parseInt(QUESTION_SERVER_PK));

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}