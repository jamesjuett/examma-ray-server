// import minimist from "minimist";
import { Exam, OriginalExamRenderer, SampleSolutionExamRenderer } from "examma-ray";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamPreview } from "examma-ray/dist/ExamPreview";
import { ExamUtils, writeFrontendJS } from "examma-ray/dist/ExamUtils";
import { mkdirSync, writeFileSync } from "fs";
import { parentPort, workerData as workerDataUntyped } from "worker_threads";
import { RATE_LIMITED_POST_MESSAGE } from "./common";
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
    RATE_LIMITED_POST_MESSAGE()
  );
  
  EXAM_GENERATOR_INDIVIDUAL.assignExams(workerData.roster),
  
  EXAM_GENERATOR_INDIVIDUAL.writeAll(new OriginalExamRenderer(), "out", "data");

  const EXAM_PREVIEW = new ExamPreview(EXAM);
  EXAM_PREVIEW.writeAll("out/preview")
}

main();
