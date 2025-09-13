// import minimist from "minimist";
import { Exam, OriginalExamRenderer } from "examma-ray";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamPreview } from "examma-ray/dist/ExamPreview";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { workerData as workerDataUntyped } from "worker_threads";
import { RATE_LIMITED_POST_MESSAGE } from "./common";
import { WorkerData_Generate } from "./run";

const workerData: WorkerData_Generate = workerDataUntyped;

async function main() {
  console.log("GENERATE WORKER STARTED".bgBlue);
  const exam_id : string = workerData.exam_id;

  const EXAM = Exam.create(ExamUtils.readExamSpecificationFromFileSync(`data/${exam_id}/exam-spec.json`));

  const exam_generator = new ExamGenerator(
    EXAM,
    {
      uuid_options: {
        strategy: "uuidv5",
        v5_namespace: workerData.uuidv5_namespace,
      },
      frontend_js_path: "js",
      seed: workerData.randomization_seed,
    },
    RATE_LIMITED_POST_MESSAGE(),
  );
  
  exam_generator.assignExams(workerData.students),
  
  exam_generator.writeAll(new OriginalExamRenderer(), "live", "data");

  // const EXAM_PREVIEW = new ExamPreview(EXAM);
  // EXAM_PREVIEW.writeAll("out/preview");
}

main();
