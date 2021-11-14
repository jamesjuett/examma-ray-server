import queryString from "query-string";
import { assert } from "../util/util";
import { ExammaRayApplication } from "./Application";
import { ManualCodeGraderApp } from "./graders/ManualCodeGrader";

function main() {

  const app = new ManualCodeGraderApp({
    checkpoints: [],
    groupingFunctionName: "none",
    testHarness: "{{submission}}",
  });
  app.start();
  
  const qs = queryString.parse(location.search)
  const EXAM_ID = qs["exam_id"];
  const QUESTION_ID = qs["question_id"];
  assert(typeof EXAM_ID === "string");
  assert(typeof QUESTION_ID === "string");
  app.loadGradingAssignment(QUESTION_ID);
}

if (typeof $ === "function") {
  $(main);
}
else {
  alert("It appears some required 3rd party libraries did not load. Please try refreshing the page (might take a few tries). If the problem persists, contact your course staff or instructors.")
}