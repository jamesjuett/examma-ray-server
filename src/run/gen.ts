// import minimist from "minimist";
import { Exam } from "examma-ray";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { readFileSync } from "fs";
import { workerData } from "worker_threads";


function main() {
  const exam_id : string = workerData.exam_id;

  const EXAM = Exam.create(ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`));

  const EXAM_GENERATOR_INDIVIDUAL = new ExamGenerator(EXAM, {
    uuid_strategy: "uuidv5",
    uuidv5_namespace: readFileSync(`data/${exam_id}/secret`, "utf-8"),
    frontend_js_path: "js/frontend.js"
  });
  
  EXAM_GENERATOR_INDIVIDUAL.assignExams(ExamUtils.loadCSVRoster(`data/${exam_id}/roster.csv`)),
  EXAM_GENERATOR_INDIVIDUAL.writeAll("out", "data");
  
}

main();
