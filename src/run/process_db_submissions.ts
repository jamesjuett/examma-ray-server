// import minimist from "minimist";
import { AssignedExam, compositeSkinId, Exam, ExamSubmission, fillManifest, parseExamSubmission, TransparentExamManifest, TrustedExamSubmission } from "examma-ray";
import { ExamGrader } from "examma-ray/dist/ExamGrader";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import extract from "extract-zip";
import { copyFileSync, rmSync, writeFileSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { workerData as workerDataUntyped } from "worker_threads";
import { query } from "../db/db";
import { db_createGroup, db_createSubmission } from "../db/db_code_grader";
import { db_addExamSubmission, db_getExamSubmissionByUuid } from "../db/db_exams";
import { db_insertManualGradingQuestionSkinIfNotExists } from "../db/db_rubrics";
import { RATE_LIMITED_POST_MESSAGE } from "./common";
import { WorkerData_ProcessDBSubmissions } from "./run";
import { db_getLiveExamSubmissionByUuid, db_getLiveExamAssignmentAndSubmission } from "../db/db_live";
import { DB_Live_Exam_Assignments, DB_Live_Submissions } from "knex/types/tables";
import { db_insertQuestionSubmissions } from "../db/db_questions";

const workerData: WorkerData_ProcessDBSubmissions = workerDataUntyped;

async function addSubmission(exam: Exam, db_submission: DB_Live_Submissions & DB_Live_Exam_Assignments) {
  
  try {
    
    // Check whether this is a duplicate submission
    const existing_submission = await db_getExamSubmissionByUuid(db_submission.exam_uuid);

    if (existing_submission) {
      // TODO: REMOVE THIS
      // for now, add question submissions
      // Load a trusted submission for them
      const manifest_file = `data/${exam.exam_id}/manifests/${db_submission.uniqname}-${db_submission.exam_uuid}.json`;
      
      const manifest = ExamUtils.loadExamManifest(manifest_file) as TransparentExamManifest;
      
      const parsed_sub = db_submission.submission as unknown as ExamSubmission;
      const trusted_sub = fillManifest(manifest, parsed_sub);
      const question_submissions = trusted_sub.sections.flatMap(s_sub => s_sub.questions.map(q_sub => ({
        question_id: q_sub.question_id,
        exam_id: exam.exam_id,
        exam_instance_uuid: db_submission.exam_instance_uuid,
        assigned_exam_uuid: db_submission.exam_uuid,
        uniqname: trusted_sub.student.uniqname,
        submission: {
          ...q_sub,
          skin_id : compositeSkinId(s_sub.skin_id, q_sub.skin_id)
        }
      })));
      await db_insertQuestionSubmissions(question_submissions);

      console.log("skipping duplicate submission for " + db_submission.uniqname + " (" + db_submission.exam_uuid + ")");
      return;
    }

    // Load a trusted submission for them
    const manifest_file = `data/${exam.exam_id}/manifests/${db_submission.uniqname}-${db_submission.exam_uuid}.json`;
    
    const manifest = ExamUtils.loadExamManifest(manifest_file) as TransparentExamManifest;
    console.log(typeof db_submission.submission);
    const parsed_sub = db_submission.submission as unknown as ExamSubmission;
    const trusted_sub = fillManifest(manifest, parsed_sub);
  
    // Write submission file to its final destination
    writeFileSync(
      `data/${exam.exam_id}/submissions/${trusted_sub.student.uniqname}-submission.json`,
      JSON.stringify(trusted_sub, null, 2),
      "utf8"
    );

    // Add submission to database
    await db_addExamSubmission(trusted_sub);
    
    const question_submissions = trusted_sub.sections.flatMap(s_sub => s_sub.questions.map(q_sub => ({
      question_id: q_sub.question_id,
      exam_id: exam.exam_id,
      exam_instance_uuid: db_submission.exam_instance_uuid,
      assigned_exam_uuid: db_submission.exam_uuid,
      uniqname: trusted_sub.student.uniqname,
      submission: {
        ...q_sub,
        skin_id : compositeSkinId(s_sub.skin_id, q_sub.skin_id)
      }
    })));
    await db_insertQuestionSubmissions(question_submissions);
    await assignGrading(exam, trusted_sub);

    return trusted_sub;
  }
  catch (err: unknown) {
    console.log(`Error processing submission for ${db_submission.uniqname} (${db_submission.exam_uuid}) for exam ${exam.exam_id} instance ${db_submission.exam_instance_uuid}:`);
    console.log(err);
  }
}

async function assignGrading(exam: Exam, submission: TrustedExamSubmission) {
  let assigned_exam = AssignedExam.createFromSubmission(exam, submission);

  await Promise.all(assigned_exam.assignedQuestions.map(async aq => {
    const group_uuid = uuidv4();
    await db_createGroup(group_uuid, aq.question.question_id, false);
    await db_insertManualGradingQuestionSkinIfNotExists(aq.question.question_id, aq.skin);
    await db_createSubmission(aq.uuid, aq.question.question_id, aq.skin.skin_id, exam.exam_id, aq.student.uniqname, aq.rawSubmission ?? "", group_uuid);
  }));
}


// import { CURVE, EXAM_GRADER } from "../grader-spec";
async function main() {

  const exam_id = <string>workerData.exam_id;
  const exam = Exam.create(ExamUtils.readExamSpecificationFromFileSync(`data/${exam_id}/exam-spec.json`));

  
  const EXAM_GRADER = new ExamGrader(exam, {}, {}, {}, RATE_LIMITED_POST_MESSAGE());

  const db_submissions = await db_getLiveExamAssignmentAndSubmission(workerData.exam_instance_uuid);

  // get submissions from the database
  await Promise.all(db_submissions.map(async sub => {

    if (!(sub as DB_Live_Submissions & DB_Live_Exam_Assignments).submission) {
      return;
    }
    
    const full_sub = sub as DB_Live_Submissions & DB_Live_Exam_Assignments;

    // some submissions accidentally got stores as stringified JSON, so parse if needed
    if (typeof full_sub.submission === "string") {
      console.log(`Parsing stringified JSON submission for ${full_sub.uniqname} (${full_sub.exam_uuid})`);

      // now fix it in the database - should actually be sufficient to just store the string, since
      // knex will convert it back to JSONB
      await query("live_submissions").where({exam_uuid: full_sub.exam_uuid}).update({
        submission: full_sub.submission
      });

      full_sub.submission = JSON.parse(full_sub.submission);
    }

    const submission = await addSubmission(exam, full_sub);

    if (submission) {
      EXAM_GRADER.addSubmission(submission);
    }
  }));

  console.log(`DONE processing submissions!`);
  console.log(`Rendering submitted exams...`);
  EXAM_GRADER.writeSubmissions(`out/${exam_id}/submissions/`);
  
  await query.destroy();
  
}

main();
