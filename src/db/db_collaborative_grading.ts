import { ExamComponentSkin } from "examma-ray";
import { DB_Exam_Instances, DB_Question_Submissions, Tables } from "knex/types/tables";
import { ManualGradingGroupRecord, ManualGradingQuestionRecords, ManualGradingRubricItem, ManualGradingRubricItemStatus } from "../manual_grading";
import { query } from "./db";
import { FITBDropRubricItem } from "examma-ray/dist/graders/StandardFITBDropGrader";
import { CollaborativeGradingFITBDropRubricItem, CollaborativeGradingFITBDropRubricItemEvaluator, CollaborativeGradingFullFITBDropRubric } from "../collaborative_grading/FITBDropGradingCommon";
import { Exact } from "../util/util";

export async function db_getCollaborativeGradingServerConfig(grading_server_pk: number) {
  return query("collaborative_grading_servers").where({grading_server_pk: grading_server_pk}).select().first();
}

export async function db_updateCollaborativeGradingServerEpoch(grading_server_pk: number, epoch: number) {
  return query("collaborative_grading_servers").where({grading_server_pk: grading_server_pk}).update({epoch: epoch});
}

export async function db_getCollaborativeGradingServersByExamInstance(exam_instance_uuid: string) {
  return await query("exam_instances_collaborative_grading_servers")
    .where({exam_instance_uuid: exam_instance_uuid}).select();
}

export async function db_getCollaborativeGradingServerByExamInstanceAndQuestion(exam_instance_uuid: string, question_id: string) {
  return await query("exam_instances_collaborative_grading_servers")
    .where({exam_instance_uuid: exam_instance_uuid, question_id: question_id}).first();
}

export async function db_getExamInstancesForGradingServer(grading_server_pk: number) {
  return await query("exam_instances_collaborative_grading_servers")
    .where({grading_server_pk: grading_server_pk}).select();
}

export async function db_getQuestionSubmissionsForGradingServer(grading_server_pk: number) {
  return await query("question_submissions")
    .join("exam_instances_collaborative_grading_servers", function() {
      this.on("question_submissions.exam_instance_uuid", "exam_instances_collaborative_grading_servers.exam_instance_uuid")
        .andOn("question_submissions.question_id", "exam_instances_collaborative_grading_servers.question_id");
    })
    .where({
      grading_server_pk: grading_server_pk,
    })
    .select("question_submissions.*") as DB_Question_Submissions[];
}

export async function db_getFITBDropRubricItems(grading_server_pk: number) : Promise<CollaborativeGradingFITBDropRubricItem[]> {
  return query("fitb_drop_rubric_items").where({grading_server_pk: grading_server_pk}).select();
}

export async function db_getFITBDropRubricItemEvaluators(rubric_item_uuid: string) : Promise<CollaborativeGradingFITBDropRubricItemEvaluator[]> {
  return query("fitb_drop_rubric_item_evaluators").where({rubric_item_uuid: rubric_item_uuid}).select();
}

export async function db_getFullFITBDropRubric(grading_server_pk: number) : Promise<CollaborativeGradingFullFITBDropRubric> {
  const items = await db_getFITBDropRubricItems(grading_server_pk);
  const evaluators = await query("fitb_drop_rubric_item_evaluators").whereIn("rubric_item_uuid", items.map(i => i.rubric_item_uuid)).select();

  const rubric_items = items.map(i => ({
    ...i,
    evaluators: evaluators.filter(e => e.rubric_item_uuid === i.rubric_item_uuid)
  }));

  return {
    rubric_items: rubric_items
  };
}

export async function db_upsertFITBDropRubricItem<T extends CollaborativeGradingFITBDropRubricItem>(item: Exact<CollaborativeGradingFITBDropRubricItem, T>) {
  return query("fitb_drop_rubric_items").insert(item).onConflict("rubric_item_uuid").merge();
}

export async function db_upsertFITBDropRubricItemEvaluator<T extends CollaborativeGradingFITBDropRubricItemEvaluator>(evaluator: Exact<CollaborativeGradingFITBDropRubricItemEvaluator, T>) {
  return query("fitb_drop_rubric_item_evaluators").insert(evaluator).onConflict("evaluator_uuid").merge();
}
