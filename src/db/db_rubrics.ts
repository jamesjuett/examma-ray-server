import { query } from "./db";

export async function db_getManualGradingRubricById(question_id: string) {
  return await query("manual_grading_rubrics").where({question_id: question_id}).select();
}

export async function db_getManualGradingRecords(group_uuid: string) {
  return await query("manual_grading_records").where({
    group_uuid: group_uuid
  }).select("rubric_item_id", "status");
}

export async function db_getGroupSubmissions(group_uuid: string) {
  return await query("manual_grading_submissions").where({
    group_uuid: group_uuid
  }).select("*");
}

export async function db_createManualGradingRubricItem(
  question_id: string,
  rubric_item_id: string,
  points: number,
  title: string,
  description: string,
  active: boolean = true) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_rubrics").insert({
    question_id: question_id,
    rubric_item_id: rubric_item_id,
    points: points,
    title: title,
    description: description,
    active: active
  }).returning("*");
}


export async function db_createManualGradingRecord(
  group_uuid: string,
  rubric_item_id: string,
  status?: string) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_records").insert({
    group_uuid: group_uuid,
    rubric_item_id: rubric_item_id,
    status: status
  }).returning("*");
}

