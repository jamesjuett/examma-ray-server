// import minimist from "minimist";
import { Exam } from "examma-ray";
import { ExamGrader, ExamGraderOptions } from "examma-ray/dist/ExamGrader";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { workerData } from "worker_threads";


// import { CURVE, EXAM_GRADER } from "../grader-spec";
function main() {
  const exam_id : string = workerData.exam_id;
  const grader_spec : ExamGraderOptions = workerData.grader_spec;
  const reports : boolean = workerData.reports;

  const EXAM = Exam.create(ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`));
  
  const EXAM_GRADER = new ExamGrader(EXAM, grader_spec, {}, {});

  // Load and verify answers
  console.log("loading submissions...");
  EXAM_GRADER.loadAllSubmissions();

  console.log("grading submissions...");
  EXAM_GRADER.gradeAll();
  
  // if (CURVE) {
  //   EXAM_GRADER.applyCurve(CURVE);
  // }

  EXAM_GRADER.writeAll();
  
  if (reports) {
    EXAM_GRADER.writeReports();
  }
  
}

main();
