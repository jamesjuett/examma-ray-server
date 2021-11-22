// // import minimist from "minimist";
// import { ExamSpecification } from "examma-ray";
// import extract from "extract-zip";
// import { readFileSync, rmSync } from "fs";
// import { workerData } from "worker_threads";
// import { EXAMMA_RAY_GRADING_SERVER } from "../server";



// console.time("test");
// const new_exam_spec = <ExamSpecification>JSON.parse(readFileSync(workerData.exam_spec_filepath, "utf8"));
// rmSync(workerData.exam_spec_filepath, { force: true });

// if (EXAMMA_RAY_GRADING_SERVER.exams_by_id[new_exam_spec.exam_id]) {
//   return res.sendStatus(403);
// }

// const exam_id = new_exam_spec.exam_id;

// await mkdir(`data/${exam_id}/`);
// await mkdir(`data/${exam_id}/manifests`);
// await mkdir(`data/${exam_id}/submissions`);

// await writeFile(`data/${exam_id}/exam-spec.json`, JSON.stringify(new_exam_spec, null, 2), "utf8");
// await writeFile(`data/${exam_id}/roster.csv`, "uniqname,name", "utf8");

// await db_createExam(new_exam_spec);

// EXAMMA_RAY_GRADING_SERVER.loadExam(new_exam_spec);

// console.timeEnd("test");


// // import { CURVE, EXAM_GRADER } from "../grader-spec";
// async function main() {
//   const exam_id = workerData.exam_id;
//   const uploaded_files : Express.Multer.File[] = workerData.files ?? [];

//   for(let i = 0; i < uploaded_files.length; ++i) {
//     const file = uploaded_files[i];
  
//     if (file.originalname.toLowerCase().endsWith(".zip")) {
//       // Extract any uploaded zip files
//       await extract(`uploads/${file.filename}`, {
//         dir: `${process.cwd()}/uploads/`,
//         onEntry: (entry, zipFile) => {
//           const filepath = `uploads/${entry.fileName}`;
//           // Add extracted submission
//           addSubmission(exam_id, filepath);

//           // Remove extracted file
//           rmSync(filepath, { force: true });
//         }
//       });

//       rmSync(`uploads${file.filename}`, { force: true });
//     }
//     else {
//       const filepath = `uploads/${file.filename}`;

//       // Add uploaded submission
//       addSubmission(exam_id, filepath);

//       // Remove uploaded file
//       rmSync(filepath, { force: true });
//     }
//   };

//   console.log(`DONE processing submissions!`);
// }