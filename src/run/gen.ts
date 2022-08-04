// import minimist from "minimist";
import { Exam, OriginalExamRenderer, SampleSolutionExamRenderer } from "examma-ray";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamUtils, writeFrontendJS } from "examma-ray/dist/ExamUtils";
import { mkdirSync, writeFileSync } from "fs";
import { parentPort, workerData as workerDataUntyped } from "worker_threads";
import { WorkerData_Generate } from "./types";

const workerData: WorkerData_Generate = workerDataUntyped;

const MESSAGE_RATE_LIMIT = 1000; // ms

function main() {
  console.log("GENERATE WORKER STARTED".bgBlue);
  const exam_id : string = workerData.exam_id;

  const EXAM = Exam.create(ExamUtils.loadExamSpecification(`data/${exam_id}/exam-spec.json`));

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

  const EXAM_GENERATOR_ALL_QUESTIONS = new ExamGenerator(EXAM, {
    uuid_strategy: "plain",
    allow_duplicates: true,
    choose_all: true,
    skins: "all"
  });
  EXAM_GENERATOR_ALL_QUESTIONS.assignExam({
    name: "Sample Solutions",
    uniqname: "solutions"
  });

  let sol_html = EXAM_GENERATOR_ALL_QUESTIONS.renderExams(new SampleSolutionExamRenderer())[0];
  let sol_dir = `out/${EXAM.exam_id}/solution`;
  mkdirSync(`${sol_dir}`, { recursive: true });
  writeFrontendJS(`${sol_dir}/js`, "frontend-solution.js");
  writeFileSync(`${sol_dir}/solution.html`, sol_html);
}

main();
