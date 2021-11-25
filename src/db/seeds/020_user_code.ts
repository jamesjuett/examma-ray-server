import { groupCollapsed } from "console";
import { Exam, Question } from "examma-ray";
import { ExamUtils } from "examma-ray/dist/ExamUtils";
import { CodeWritingGrader, CodeWritingGradingResult } from "examma-ray/dist/graders/CodeWritingGrader";
import { GradingGroup } from "examma-ray/dist/grading_interface/common";
import { ResponseKind } from "examma-ray/dist/response/common";
import { readFileSync } from "fs";
import { Knex } from "knex";
import pLimit from "p-limit";
import { v4 as uuidv4 } from "uuid";
import { db_createCodeGraderConfig, db_createGroup, db_createSubmission } from "../db_code_grader";
import { db_createManualGradingRecord, db_createManualGradingRubricItem } from "../db_rubrics";


// Run with limited concurrency so we don't have a ton of serial delay
// due to back and forth for each individual DB request, but also so we
// don't completely destroy everything with a bazillion requests at once.
const limit = pLimit(100);

export async function seed(knex: Knex): Promise<void> {

  process.chdir("../");

  const EXAM_ID = "eecs280f21midterm";

  const EXAM = Exam.create(ExamUtils.loadExamSpecification(`data/${EXAM_ID}/exam-spec.json`));

  for (let i = 0; i < EXAM.allQuestions.length; ++i) {
    await createQuestionSubmissions(EXAM_ID, EXAM.allQuestions[i]);
    console.log("done");
  }
  
}

async function createQuestionSubmissions(exam_id: string, question: Question) {
  const question_id = question.question_id;
  const grader_spec = question.defaultGrader?.spec;
  if (grader_spec?.grader_kind === "manual_code_writing") {
    const rubric_creators = grader_spec.rubric.map(async (ri) => {
      return db_createManualGradingRubricItem(question_id, ri.id, ri.points, ri.title, ri.description, true);
    });

    try {
      await Promise.all(rubric_creators);
    }
    catch(e: unknown) {
      console.log(`ERROR ON ${question_id}`);
    }
  };

  let manual_grading = ExamUtils.readGradingAssignments(exam_id, question_id);

  await db_createCodeGraderConfig(question_id, "{{submission}}", "test");

  let i = 0;
  let inserted = <any>{};

  let submission_creators = manual_grading.flatMap(assn => {
    return assn.groups.flatMap(async (group) => {
      const group_uuid = await createGroup(question_id, <GradingGroup<ResponseKind, CodeWritingGradingResult>>group);

      return await Promise.all(group.submissions.flatMap(sub => limit(async () => {
        if (inserted[sub.question_uuid]) {
          // do nothing for duplicates
        }
        else {
          inserted[sub.question_uuid] = true;
          await db_createSubmission(sub.question_uuid, question_id, exam_id, sub.student.uniqname, sub.response, group_uuid)
          
          process.stdout.cursorTo(0);
          process.stdout.write(`Populated ${++i} submissions for ${question_id}...`);
        }
      })));
    });
  });

  return await Promise.all(submission_creators);
}

async function createGroup(question_id: string, group: GradingGroup<ResponseKind, CodeWritingGradingResult>) {
  const group_uuid = uuidv4();
  await db_createGroup(group_uuid, question_id, group.grading_result?.verified);

  let item_creators = Object.entries(group.grading_result?.itemResults ?? {}).map(async ([rubric_item_id, result]) => {
    return db_createManualGradingRecord(group_uuid, rubric_item_id, result?.status);
  });

  await Promise.all(item_creators);
  return group_uuid;
}
