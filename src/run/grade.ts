// import minimist from "minimist";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { ExamGrader } from "examma-ray/dist/ExamGrader";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { Exam } from "examma-ray";
import { readFileSync, writeFileSync } from "fs";
import { performance } from "perf_hooks"

import { workerData } from "worker_threads";

// import { CURVE, EXAM_GRADER } from "../grader-spec";
function main() {
  const exam_id = workerData.exam_id;
  const grader_spec = workerData.grader_spec;

  let startTime = performance.now();
  const spec = ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`);
  console.log(`time: ${performance.now() - startTime} milliseconds`);
  const EXAM = Exam.create(spec);
  console.log(`time: ${performance.now() - startTime} milliseconds`);

  // const EXAM_GENERATOR_INDIVIDUAL = new ExamGenerator(EXAM, {
  //   uuid_strategy: "uuidv5",
  //   uuidv5_namespace: readFileSync(`data/${exam_id}/secret`, "utf-8"),
  //   frontend_js_path: "js/frontend.js"
  // });
  
  // EXAM_GENERATOR_INDIVIDUAL.assignExams(ExamUtils.loadCSVRoster(`data/${exam_id}/roster.csv`)),
  // EXAM_GENERATOR_INDIVIDUAL.writeAll("out", "data");
  
  const EXAM_GRADER = new ExamGrader(EXAM, grader_spec, {}, {});

  // let argv = minimist(process.argv, {
  //   alias: {
  //     "r": "reports",
  //   },
  //   default: {

  //   }
  // });
  
  // let reports: string = argv["reports"];

  // Load and verify answers
  console.log("loading submissions...");
  EXAM_GRADER.loadAllSubmissions();

  console.log("grading submissions...");
  EXAM_GRADER.gradeAll();
  
  // if (CURVE) {
  //   EXAM_GRADER.applyCurve(CURVE);
  // }

  EXAM_GRADER.writeAll();
  
  // if (reports) {
  //   EXAM_GRADER.writeReports();
  // }
  
}

main();
