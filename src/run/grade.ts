// import minimist from "minimist";
import { Exam, fillManifest, parseExamSubmission, Question, QuestionGrader, TransparentExamManifest } from "examma-ray";
import { IndividualizedNormalCurve } from "examma-ray/dist/core/ExamCurve";
import { ExamGrader, ExamGraderOptions, ExceptionMap, GraderSpecificationMap } from "examma-ray/dist/ExamGrader";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { CodeWritingGrader } from "examma-ray/dist/graders";
import { CodeWritingGraderData, CodeWritingGraderSubmissionResult } from "examma-ray/dist/graders/CodeWritingGrader";
import { ManualGenericGrader } from "examma-ray/dist/graders/ManualGenericGrader";
import { readFileSync } from "fs";
import { workerData as workerDataUntyped } from "worker_threads";
import { RunGradingRequest } from "../dashboard";
import { query } from "../db/db";
import { db_getManualGradingRecords, db_getManualGradingRubric } from "../db/db_rubrics";
import { RATE_LIMITED_POST_MESSAGE } from "./common";
import { WorkerData_Grade } from "./run";
import { db_getLiveExamSubmissionByUuid } from "../db/db_live";
import { ExamSubmission, isTransparentExamManifest } from "examma-ray/dist/core/submissions";
import { assert } from "../util/util";
import { db_getCollaborativeGradingServerConfig, db_getCollaborativeGradingServersByExamInstance } from "../db/db_collaborative_grading";
import { collaborativeGradingStrategy } from "../collaborative_grading/CollaborativeGrading";

const workerData: WorkerData_Grade = workerDataUntyped;

class WebExamGrader extends ExamGrader {
  
  private grading_data: {
    [index: string]: CodeWritingGraderData
  };

  private constructor(exam: Exam, options: ExamGraderOptions, graders?: GraderSpecificationMap | readonly GraderSpecificationMap[], exceptions?: ExceptionMap | readonly ExceptionMap[], onStatus?: (status: string) => void, grading_data: {
    [index: string]: CodeWritingGraderData
  } = {}) {
    super(exam, options, graders, exceptions, onStatus);
    this.grading_data = grading_data;
  }

  public static async create(exam: Exam, exam_isntance_uuid: string, options: ExamGraderOptions, exceptions?: ExceptionMap | readonly ExceptionMap[], onStatus?: (status: string) => void) {
    let grading_data : { [index: string]: CodeWritingGraderData } = {};

    const collaborative_grading_servers = await db_getCollaborativeGradingServersByExamInstance(exam_isntance_uuid);
    const cgs_graders = Object.fromEntries(await Promise.all(collaborative_grading_servers.map(async cg => {
      const config = await db_getCollaborativeGradingServerConfig(cg.grading_server_pk);
      assert(config !== undefined, `No collaborative grading server config found for PK ${cg.grading_server_pk}`);
      const strategy = collaborativeGradingStrategy(config.grader_kind);
      return [
        cg.question_id,
        strategy.loadGraderSpec(await strategy.loadGradingRecords(cg.grading_server_pk))
      ] as const;
    })));

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
    return new WebExamGrader(exam, options, cgs_graders, exceptions, onStatus, grading_data);
  }

  protected override prepareGradingData(question: Question, grader: QuestionGrader) {
    if (grader instanceof CodeWritingGrader || grader instanceof ManualGenericGrader) {
      return this.grading_data[question.question_id];
    }
  }
}


// import { CURVE, EXAM_GRADER } from "../grader-spec";
async function main() {
  const exam_id = workerData.exam_id;
  const assigned_exams = workerData.assigned_exams;
  const grade_request = workerData.grade_request;
  const uuidv5_namespace = workerData.uuidv5_namespace;

  const EXAM = Exam.create(ExamUtils.readExamSpecificationFromFileSync(`data/${exam_id}/exam-spec.json`));
  
  let EXCEPTIONS: ExceptionMap | undefined = undefined;
  try {
    EXCEPTIONS = JSON.parse(readFileSync(`data/${exam_id}/exceptions/exceptions.json`, "utf-8"));
    console.log("loaded exceptions file");
  }
  catch(e) {
    console.log(e);
  }

  const EXAM_GRADER = await WebExamGrader.create(
    EXAM,
    workerData.exam_instance_uuid,
    {
      uuid_options: { strategy: "uuidv5", v5_namespace: uuidv5_namespace },
      assets_bundle_dir: `data/${exam_id}/assets/`,
    },
    EXCEPTIONS,
    RATE_LIMITED_POST_MESSAGE()
  );

  // load submissions
  const trusted_submissions = (await Promise.all(assigned_exams.map(async exam_assn => {
    try {
      const manifest = ExamUtils.loadExamManifest(`data/${exam_id}/manifests/${exam_assn.uniqname}-${exam_assn.exam_uuid}.json`);
      assert(isTransparentExamManifest(manifest));
      const db_submission = await db_getLiveExamSubmissionByUuid(exam_assn.exam_uuid);
      if (!db_submission) {
        console.log(`No submission found for ${exam_assn.uniqname} (${exam_assn.exam_uuid})`);
        return undefined;
      }

      // some submissions accidentally got stores as stringified JSON, so parse if needed
      if (typeof db_submission.submission === "string") {
        console.log(`Parsing stringified JSON submission for ${exam_assn.uniqname} (${exam_assn.exam_uuid})`);

        // now fix it in the database - should actually be sufficient to just store the string, since
        // knex will convert it back to JSONB
        await query("live_submissions").where({exam_uuid: exam_assn.exam_uuid}).update({
          submission: db_submission.submission
        });

        db_submission.submission = JSON.parse(db_submission.submission);
      }

      const submission = db_submission.submission as unknown as ExamSubmission;
      console.log(`Loaded submission for ${exam_assn.uniqname}: ${typeof submission}`);
      return fillManifest(manifest, submission);
    }
    catch(e) {
      console.log(`Error loading submission for ${exam_assn.uniqname} (${exam_assn.exam_uuid}): ${e}`);
      return undefined;
    }
  }))).filter(x => x !== undefined);


  // Load and verify answers
  console.log("loading submissions...");
  trusted_submissions.forEach(sub => EXAM_GRADER.addSubmission(sub));
  console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAa");

  console.log("grading submissions...");
  EXAM_GRADER.gradeAll();
  
  if (grade_request.curve) {
    EXAM_GRADER.applyCurve(new IndividualizedNormalCurve(EXAM_GRADER.stats, grade_request.target_mean, grade_request.target_stddev, true));
  }

  EXAM_GRADER.writeAll();
  
  if (grade_request.reports) {
    try {
      EXAM_GRADER.writeReports(`live/${exam_id}/graded/`);
      EXAM_GRADER.writeReports(`out/${exam_id}/graded/exams/`);
    }
    catch(e) {
      console.log(e);
      throw e;
    }
  }

  await query.destroy();
}

main();
