// import minimist from "minimist";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { ExamGrader } from "examma-ray/dist/ExamGrader";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { Exam } from "examma-ray";
import { readFileSync, writeFileSync } from "fs";


// import { CURVE, EXAM_GRADER } from "../grader-spec";
function main() {
  const exam_id = "eecs280f21midterm";

  const EXAM = Exam.create(ExamUtils.loadExamSpecification(`exams/data/${exam_id}/exam-spec.json`));
  
  const EXAM_GENERATOR_INDIVIDUAL = new ExamGenerator(EXAM, {
    uuid_strategy: "uuidv5",
    uuidv5_namespace: readFileSync(`exams/data/${exam_id}/secret`, "utf-8"),
    frontend_js_path: "js/frontend.js"
  });
  
  EXAM_GENERATOR_INDIVIDUAL.assignExams(ExamUtils.loadCSVRoster(`exams/data/${exam_id}/roster.csv`)),
  EXAM_GENERATOR_INDIVIDUAL.writeAll("exams/out", "exams/data");
  
  // const EXAM_GRADER = new ExamGrader(EXAM, {
  //   uuid_strategy: "uuidv5",
  //   uuidv5_namespace: "80cb  59ff-1a60-4c18-959e-beeb77473c8c",
  //   frontend_js_path: "js/frontend-graded.js",
  // }, {}, {});
  // let argv = minimist(process.argv, {
  //   alias: {
  //     "r": "reports",
  //   },
  //   default: {

  //   }
  // });
  
  // let reports: string = argv["reports"];

  // // Load and verify answers
  // console.log("loading submissions...");
  // EXAM_GRADER.loadAllSubmissions();

  // console.log("grading submissions...");
  // EXAM_GRADER.gradeAll();
  
  // // if (CURVE) {
  // //   EXAM_GRADER.applyCurve(CURVE);
  // // }

  // EXAM_GRADER.writeAll();
  
  // if (reports) {
  //   EXAM_GRADER.writeReports();
  // }
  
}

main();
