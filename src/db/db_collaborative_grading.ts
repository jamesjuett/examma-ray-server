import { ExamComponentSkin } from "examma-ray";
import { DB_Exam_Instances, DB_Question_Submissions, Tables } from "knex/types/tables";
import { ManualGradingGroupRecord, ManualGradingQuestionRecords, ManualGradingRubricItem, ManualGradingRubricItemStatus } from "../manual_grading";
import { query } from "./db";
import { FITBDropRubricItem } from "examma-ray/dist/graders/StandardFITBDropGrader";
import { CollaborativeGradingFITBDropRubricItem, CollaborativeGradingFITBDropEvaluator, CollaborativeGradingFullFITBDropRubric } from "../collaborative_grading/FITBDropGradingCommon";
import { Exact } from "../util/util";
import { CollaborativeGraderKind } from "../collaborative_grading/CollaborativeGradingTypes";

export async function db_createCollaborativeGradingServer(question_id: string, grader_kind: CollaborativeGraderKind) {
  return (await query("collaborative_grading_servers").insert({
    question_id: question_id,
    grader_kind: grader_kind,
  }).returning("*"))[0];
}

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

export async function db_upsertCollaborativeGradingServerForExamInstanceAndQuestion(exam_instance_uuid: string, question_id: string, grading_server_pk: number) {
  return await query("exam_instances_collaborative_grading_servers").insert({
    exam_instance_uuid: exam_instance_uuid,
    question_id: question_id,
    grading_server_pk: grading_server_pk,
  }).onConflict(["exam_instance_uuid", "question_id"]).merge();
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

export async function db_getFITBDropEvaluators(rubric_item_uuid: string) : Promise<CollaborativeGradingFITBDropEvaluator[]> {
  return query("fitb_drop_rubric_item_evaluators").where({rubric_item_uuid: rubric_item_uuid}).select();
}

export async function db_getFullFITBDropRubric(grading_server_pk: number) : Promise<CollaborativeGradingFullFITBDropRubric> {
  const items = await db_getFITBDropRubricItems(grading_server_pk);
  const evaluators = await query("fitb_drop_rubric_item_evaluators").whereIn("rubric_item_uuid", items.map(i => i.rubric_item_uuid)).select();

  return {
    rubric_items: items,
    evaluators: evaluators,
  };
}

export async function db_upsertFITBDropRubricItem<T extends CollaborativeGradingFITBDropRubricItem>(item: Exact<CollaborativeGradingFITBDropRubricItem, T>) {
  return query("fitb_drop_rubric_items").insert({
    rubric_item_uuid: item.rubric_item_uuid,
    grading_server_pk: item.grading_server_pk,
    title: item.title,
    points: item.points,
    description: item.description,
    policy: item.policy,
    sort_index: item.sort_index,
    active: item.active,
  }).onConflict("rubric_item_uuid").merge();
}

export async function db_upsertFITBDropEvaluator<T extends CollaborativeGradingFITBDropEvaluator>(evaluator: Exact<CollaborativeGradingFITBDropEvaluator, T>) {
  return query("fitb_drop_rubric_item_evaluators").insert({
    evaluator_uuid: evaluator.evaluator_uuid,
    rubric_item_uuid: evaluator.rubric_item_uuid,
    name: evaluator.name,
    spec: evaluator.spec,
    sort_index: evaluator.sort_index,
  }).onConflict("evaluator_uuid").merge();
}
