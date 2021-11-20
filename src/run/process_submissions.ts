// import minimist from "minimist";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { writeFileSync } from "fs";
import { workerData } from "worker_threads";
import extract from "extract-zip";

function addSubmission(exam_id: string, filename: string) {
  
  try {
    const manifest_directory = `data/${exam_id}/manifests/`
    let trusted_submission = ExamUtils.loadTrustedSubmission(
      manifest_directory,
      `uploads/${filename}`
    );
  
    writeFileSync(
      `data/${exam_id}/submissions/${trusted_submission.student.uniqname}-submission.json`,
      JSON.stringify(trusted_submission, null, 2),
      "utf8"
    );
  }
  catch (e: unknown) {
    console.log("ERROR processing submission for " + filename);
  }
}


// import { CURVE, EXAM_GRADER } from "../grader-spec";
async function main() {
  const exam_id = workerData.exam_id;
  const uploaded_files : Express.Multer.File[] = workerData.files ?? [];

  for(let i = 0; i < uploaded_files.length; ++i) {
    const file = uploaded_files[i];
  
    // Extract any uploaded zip files
    if (file.originalname.toLowerCase().endsWith(".zip")) {
      await extract(`uploads/${file.filename}`, {
        dir: `${process.cwd()}/uploads/`,
        onEntry: (entry, zipFile) => {
          addSubmission(exam_id, entry.fileName);
        }
      });
    }
    else {
      addSubmission(exam_id, file.filename);
    }
  };

  console.log(`DONE processing submissions!`);

  // console
  // const grader_spec : ExamGraderOptions = workerData.grader_spec;
  // const reports : boolean = workerData.reports;

  // const EXAM = Exam.create(ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`));

  // // const EXAM_GENERATOR_INDIVIDUAL = new ExamGenerator(EXAM, {
  // //   uuid_strategy: "uuidv5",
  // //   uuidv5_namespace: readFileSync(`data/${exam_id}/secret`, "utf-8"),
  // //   frontend_js_path: "js/frontend.js"
  // // });
  
  // // EXAM_GENERATOR_INDIVIDUAL.assignExams(ExamUtils.loadCSVRoster(`data/${exam_id}/roster.csv`)),
  // // EXAM_GENERATOR_INDIVIDUAL.writeAll("out", "data");
  
  // const EXAM_GRADER = new ExamGrader(EXAM, grader_spec, {}, {});

  // // let argv = minimist(process.argv, {
  // //   alias: {
  // //     "r": "reports",
  // //   },
  // //   default: {

  // //   }
  // // });
  
  // // let reports: string = argv["reports"];

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
