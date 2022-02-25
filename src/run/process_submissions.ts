// import minimist from "minimist";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { copyFileSync, rmSync, writeFileSync } from "fs";
import { workerData } from "worker_threads";
import extract from "extract-zip";
import { db_addExamSubmission, db_getExamSubmissionByUuid } from "../db/db_exams";
import { query } from "../db/db";
import { v4 as uuidv4 } from "uuid";
import { AssignedExam, Exam, TrustedExamSubmission } from "examma-ray";
import { db_createGroup, db_createSubmission } from "../db/db_code_grader";
import { stringify_response } from "examma-ray/dist/response/responses";
import { db_insertManualGradingQuestionSkinIfNotExists } from "../db/db_rubrics";

// type Upload_Status = {
//   "complete" | 
// }

async function addSubmission(exam: Exam, filepath: string, originalFilename: string) {
  
  try {
    // Load a trusted submission for them
    const manifest_directory = `data/${exam.exam_id}/manifests/`
    let new_submission = ExamUtils.loadTrustedSubmission(
      manifest_directory,
      filepath
    );

    // Check whether this is a duplicate submission
    const existing_submission = await db_getExamSubmissionByUuid(new_submission.uuid);

    if (existing_submission) {
      console.log("skipping duplicate submission for " + filepath);
      return;
    }
  
    // Write submission file to its final destination
    writeFileSync(
      `data/${exam.exam_id}/submissions/${new_submission.student.uniqname}-submission.json`,
      JSON.stringify(new_submission, null, 2),
      "utf8"
    );

    // Add submission to database
    await db_addExamSubmission(new_submission);

    await assignGrading(exam, new_submission);
  }
  catch (e: unknown) {
    console.log("ERROR processing submission for " + filepath);
    copyFileSync(filepath, `data/${exam.exam_id}/error-submissions/${uuidv4()}-${originalFilename}`,)
    console.log(e);
  }
}

async function assignGrading(exam: Exam, submission: TrustedExamSubmission) {
  let assigned_exam = AssignedExam.createFromSubmission(exam, submission);

  await Promise.all(assigned_exam.assignedQuestions.map(async aq => {
    const group_uuid = uuidv4();
    await db_createGroup(group_uuid, aq.question.question_id, false);
    await db_insertManualGradingQuestionSkinIfNotExists(aq.question.question_id, aq.skin);
    await db_createSubmission(aq.uuid, aq.question.question_id, aq.skin.skin_id, exam.exam_id, aq.student.uniqname, aq.rawSubmission, group_uuid);
  }));
}


// import { CURVE, EXAM_GRADER } from "../grader-spec";
async function main() {
  const exam_id = <string>workerData.exam_id;

  const exam = Exam.create(ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`));

  const uploaded_files : Express.Multer.File[] = workerData.files ?? [];

  let toProcess : {
    filepath: string,
    originalFilename: string
  }[] = [];
  for(let i = 0; i < uploaded_files.length; ++i) {
    const file = uploaded_files[i];
    if (file.originalname.toLowerCase().endsWith(".zip")) {
      // Extract any uploaded zip files
      await extract(`uploads/${file.filename}`, {
        dir: `${process.cwd()}/uploads/`,
        onEntry: (entry, zipFile) => {
          const filepath = `uploads/${entry.fileName}`;
          toProcess.push({filepath: filepath, originalFilename: entry.fileName});
        }
      });

      rmSync(`uploads/${file.filename}`, { force: true });
    }
    else {
      toProcess.push({filepath: `uploads/${file.filename}`, originalFilename: file.originalname});
    }
  }

  for(let i = 0; i < toProcess.length; ++i) {
    const filepath = toProcess[i].filepath;
    const originalFilename = toProcess[i].originalFilename;

    // Add uploaded submission
    await addSubmission(exam, filepath, originalFilename);

    // Remove uploaded file
    rmSync(filepath, { force: true });
  };

  console.log(`DONE processing submissions!`);
  
  await query.destroy();
  
}

main();
