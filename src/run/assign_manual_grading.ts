// import minimist from "minimist";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { copyFileSync, rmSync, writeFileSync } from "fs";
import { workerData } from "worker_threads";
import extract from "extract-zip";
import { db_addExamSubmission, db_getExamSubmissionByUuid } from "../db/db_exams";
import { query } from "../db/db";
import { v4 as uuidv4 } from "uuid";

// type Upload_Status = {
//   "complete" | 
// }

async function addSubmission(exam_id: string, filepath: string, originalFilename: string) {
  
  try {
    // Load a trusted submission for them
    const manifest_directory = `data/${exam_id}/manifests/`
    let new_submission = ExamUtils.loadTrustedSubmission(
      manifest_directory,
      filepath
    );

    // Check whether this is a duplicate submission
    const existing_submission = await db_getExamSubmissionByUuid(new_submission.uuid);

    if (existing_submission) {
      return;
    }
  
    // Write submission file to its final destination
    writeFileSync(
      `data/${exam_id}/submissions/${new_submission.student.uniqname}-submission.json`,
      JSON.stringify(new_submission, null, 2),
      "utf8"
    );

    // Add submission to database
    await db_addExamSubmission(new_submission);
  }
  catch (e: unknown) {
    console.log("ERROR processing submission for " + filepath);
    copyFileSync(filepath, `data/${exam_id}/error-submissions/${uuidv4()}-${originalFilename}`,)
    // console.log(e);
  }
}


// import { CURVE, EXAM_GRADER } from "../grader-spec";
async function main() {
  const exam_id = workerData.exam_id;
  const uploaded_files : Express.Multer.File[] = workerData.files ?? [];

  for(let i = 0; i < uploaded_files.length; ++i) {
    const file = uploaded_files[i];
  
    if (file.originalname.toLowerCase().endsWith(".zip")) {
      // Extract any uploaded zip files
      await extract(`uploads/${file.filename}`, {
        dir: `${process.cwd()}/uploads/`,
        onEntry: (entry, zipFile) => {
          const filepath = `uploads/${entry.fileName}`;
          // Add extracted submission
          addSubmission(exam_id, filepath, entry.fileName);

          // Remove extracted file
          rmSync(filepath, { force: true });
        }
      });

      rmSync(`uploads${file.filename}`, { force: true });
    }
    else {
      const filepath = `uploads/${file.filename}`;
      const originalFilename = file.originalname;

      // Add uploaded submission
      await addSubmission(exam_id, filepath, originalFilename);

      // Remove uploaded file
      rmSync(filepath, { force: true });
    }
  };

  console.log(`DONE processing submissions!`);
  
  await query.destroy();
 
}

main();
