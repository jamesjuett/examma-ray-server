import queryString from "query-string";
import { assert } from "../util/util";
import { ManualGraderApp } from "./ManualGrader";
import { QuestionSubmissionComponent } from "./QuestionSubmissionComponent";

async function main() {

  
  const qs = queryString.parse(location.search);
  const EXAM_ID = qs["exam_id"];
  const QUESTION_ID = qs["question_id"];
  assert(typeof EXAM_ID === "string");
  assert(typeof QUESTION_ID === "string");
  const app = await ManualGraderApp.create(QuestionSubmissionComponent, EXAM_ID, QUESTION_ID);

}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}