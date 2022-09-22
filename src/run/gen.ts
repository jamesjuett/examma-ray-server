// import minimist from "minimist";
import { Exam, OriginalExamRenderer } from "examma-ray";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { parentPort, workerData as workerDataUntyped } from "worker_threads";
import { WorkerData_Generate } from "./types";

const workerData: WorkerData_Generate = workerDataUntyped;

const MESSAGE_RATE_LIMIT = 1000; // ms

function main() {
  console.log("GENERATE WORKER STARTED".bgBlue);
  const exam_id : string = workerData.exam_id;

  const EXAM = Exam.create(ExamUtils.readExamSpecificationFromFileSync(`data/${exam_id}/exam-spec.json`));

  let lastMessage = Date.now();

  const EXAM_GENERATOR_INDIVIDUAL = new ExamGenerator(
    EXAM,
    workerData.gen_spec,
    (status: string) => {
      if (Date.now() > lastMessage + MESSAGE_RATE_LIMIT) {
        lastMessage = Date.now();
        parentPort?.postMessage(status);
      }
    }
  );
  
  EXAM_GENERATOR_INDIVIDUAL.assignExams(workerData.roster),
  
  EXAM_GENERATOR_INDIVIDUAL.writeAll(new OriginalExamRenderer(), "out", "data");
}

main();
