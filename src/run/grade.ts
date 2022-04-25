// import minimist from "minimist";
import { Exam, Question, QuestionGrader, SampleSolutionExamRenderer } from "examma-ray";
import { IndividualizedNormalCurve } from "examma-ray/dist/core/ExamCurve";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamGrader, ExamGraderOptions, ExceptionMap, GraderSpecificationMap } from "examma-ray/dist/ExamGrader";
import { ExamUtils, writeFrontendJS } from "examma-ray/dist/ExamUtils";
import { CodeWritingGrader } from "examma-ray/dist/graders";
import { CodeWritingGraderData, CodeWritingGraderSubmissionResult } from "examma-ray/dist/graders/CodeWritingGrader";
import { ManualGenericGrader } from "examma-ray/dist/graders/ManualGenericGrader";
import { mkdirSync, writeFileSync } from "fs";
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
    if (grader instanceof CodeWritingGrader || grader instanceof ManualGenericGrader) {
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

  EXAM_GRADER.writeSubmissions();
  EXAM_GRADER.writeAll();
  
  if (run_request.reports) {
    EXAM_GRADER.writeReports();
  }

  const EXAM_GENERATOR_PREVIEW = new ExamGenerator(EXAM, {
    uuid_strategy: "plain",
    allow_duplicates: true,
    choose_all: true,
    skins: "all"
  });
  EXAM_GENERATOR_PREVIEW.assignExam({
    name: "Sample Solutions",
    uniqname: "solutions"
  });

  let sol_html = EXAM_GENERATOR_PREVIEW.renderExams(new SampleSolutionExamRenderer())[0];
  let sol_dir = `out/${EXAM.exam_id}/solution`;
  mkdirSync(`${sol_dir}`, { recursive: true });
  writeFrontendJS(`${sol_dir}/js`, "frontend-solution.js");
  writeFileSync(`${sol_dir}/solution.html`, sol_html);
  await query.destroy();
  
}

main();
