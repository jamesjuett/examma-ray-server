// import minimist from "minimist";
import { Exam, OriginalExamRenderer } from "examma-ray";
import { ExamGenerator } from "examma-ray/dist/ExamGenerator";
import { ExamPreview } from "examma-ray/dist/ExamPreview";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { workerData as workerDataUntyped } from "worker_threads";
import { RATE_LIMITED_POST_MESSAGE } from "./common";
import { WorkerData_Generate } from "./types";
import { query } from "../db/db";
import { db_createLiveExamAssignment, db_createLiveExamInstance } from "../db/db_live";

const workerData: WorkerData_Generate = workerDataUntyped;

const MESSAGE_RATE_LIMIT = 1000; // ms

async function main() {
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
  
  EXAM_GENERATOR_INDIVIDUAL.writeAll(new OriginalExamRenderer(), "live", "data");

  const EXAM_PREVIEW = new ExamPreview(EXAM);
  EXAM_PREVIEW.writeAll("out/preview");

  const live_exam_instance = await db_createLiveExamInstance(EXAM.exam_id, 600);

  await Promise.all(
    EXAM_GENERATOR_INDIVIDUAL.assignedExams.map(async ae => db_createLiveExamAssignment(
      ae.uuid, live_exam_instance.exam_instance_uuid,
      ae.student.uniqname, ae.student.uniqname + "@umich.edu"
    )
  ));

  await query.destroy();
}

main();
