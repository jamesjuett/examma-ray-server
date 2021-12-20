// import minimist from "minimist";
import { Exam, Question, QuestionGrader } from "examma-ray";
import { IndividualizedNormalCurve } from "examma-ray/dist/core/ExamCurve";
import { ExamGrader, ExamGraderOptions, ExceptionMap, GraderSpecificationMap } from "examma-ray/dist/ExamGrader";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { CodeWritingGrader } from "examma-ray/dist/graders";
import { CodeWritingGraderData, CodeWritingGraderSubmissionResult } from "examma-ray/dist/graders/CodeWritingGrader";
import { parentPort, workerData } from "worker_threads";
import { RunGradingRequest } from "../dashboard";
import { query } from "../db/db";
import { db_getManualGradingRecords, db_getManualGradingRubric } from "../db/db_rubrics";

const MESSAGE_RATE_LIMIT = 1000; // ms

class WebExamGrader extends ExamGrader {
  
  private grading_data: {
    [index: string]: CodeWritingGraderData
  };

  private constructor(exam: Exam, options: Partial<ExamGraderOptions> = {}, graders?: GraderSpecificationMap | readonly GraderSpecificationMap[], exceptions?: ExceptionMap | readonly ExceptionMap[], onStatus?: (status: string) => void, grading_data: {
    [index: string]: CodeWritingGraderData
  } = {}) {
    super(exam, options, graders, exceptions, onStatus);
    this.grading_data = grading_data;
  }

  public static async create(exam: Exam, options: Partial<ExamGraderOptions> = {}, graders?: GraderSpecificationMap | readonly GraderSpecificationMap[], exceptions?: ExceptionMap | readonly ExceptionMap[], onStatus?: (status: string) => void) {
    let grading_data : { [index: string]: CodeWritingGraderData } = {};
    for(let question of exam.allQuestions) {
      // if (question.kind === "code_editor") {
        let rubric = await db_getManualGradingRubric(question.question_id);
        let records = await db_getManualGradingRecords(question.question_id);
        let submission_results: CodeWritingGraderSubmissionResult[] = Object.values(records.groups).flatMap(
          group => group!.submissions.map(sub => <CodeWritingGraderSubmissionResult>{
            submission_uuid: sub.submission_uuid,
            finished: group!.finished,
            grader: group!.grader,
            rubric_items: group!.grading_result
          })
        );
        grading_data[question.question_id] = {
          rubric: rubric,
          submission_results: submission_results
        }
      // }
    }
    return new WebExamGrader(exam, options, graders, exceptions, onStatus, grading_data);
  }

  protected override prepareGradingData(question: Question, grader: QuestionGrader) {
    if (grader instanceof CodeWritingGrader) {
      return this.grading_data[question.question_id];
    }
  }
}


// import { CURVE, EXAM_GRADER } from "../grader-spec";
async function main() {
  const exam_id : string = workerData.exam_id;
  const grader_spec : ExamGraderOptions = workerData.grader_spec;
  const run_request : RunGradingRequest = workerData.run_request;

  const EXAM = Exam.create(ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`));
  
  let lastMessage = Date.now();
  
  const EXAM_GRADER = await WebExamGrader.create(EXAM, grader_spec, {}, {},
    (status: string) => {
      if (Date.now() > lastMessage + MESSAGE_RATE_LIMIT) {
        lastMessage = Date.now();
        parentPort?.postMessage(status);
      }
    });

  // Load and verify answers
  console.log("loading submissions...");
  EXAM_GRADER.loadAllSubmissions();
  console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa");

  console.log("grading submissions...");
  EXAM_GRADER.gradeAll();
  
  if (run_request.curve) {
    EXAM_GRADER.applyCurve(new IndividualizedNormalCurve(EXAM_GRADER.stats, run_request.target_mean, run_request.target_stddev, true));
  }

  EXAM_GRADER.writeAll();
  
  if (run_request.reports) {
    EXAM_GRADER.writeReports();
  }
  
  await query.destroy();
  
}

main();
