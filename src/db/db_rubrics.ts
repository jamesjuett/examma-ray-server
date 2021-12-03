import { Tables } from "knex/types/tables";
import { ManualGradingGroupRecord, ManualGradingQuestionRecords, ManualGradingRubricItem, ManualGradingRubricItemStatus } from "../manual_grading";
import { query } from "./db";

export async function db_getManualGradingQuestion(question_id: string) {
  return await query("manual_grading_questions").where({question_id: question_id}).select().first();
}

export async function db_setManualGradingQuestion(
  question_id: string,
  grading_epoch: number) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_questions").insert({
    question_id: question_id,
    grading_epoch: grading_epoch
  }).onConflict("question_id").merge();
}


export async function db_getManualGradingRubric(question_id: string) {
  return await query("manual_grading_rubrics").where({question_id: question_id}).select();
}

export async function db_getGroupSubmissions(group_uuid: string) {
  return await query("manual_grading_submissions").where({
    group_uuid: group_uuid
  }).select("*");
}

export async function db_getManualGradingRubricItem(question_id: string, rubric_item_uuid: string) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_rubrics").where({
    question_id: question_id,
    rubric_item_uuid: rubric_item_uuid
  }).select().first();
}

export async function db_createManualGradingRubricItem(question_id: string, rubric_item_uuid: string, rubric_item: ManualGradingRubricItem) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_rubrics").insert({
    question_id: question_id,
    rubric_item_uuid: rubric_item_uuid,
    points: rubric_item.points,
    title: rubric_item.title,
    description: rubric_item.description,
    active: rubric_item.active
  }).returning("*");
}

export async function db_updateManualGradingRubricItem(question_id: string, rubric_item_uuid: string, updates: Partial<ManualGradingRubricItem>) {

  return await query("manual_grading_rubrics").where({
    question_id: question_id,
    rubric_item_uuid: rubric_item_uuid
  }).update({
    points: updates.points,
    description: updates.description,
    title: updates.title,
    active: updates.active
  });

}


export async function db_setManualGradingRecord(
  group_uuid: string,
  rubric_item_uuid: string,
  status: ManualGradingRubricItemStatus) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_records").insert({
    group_uuid: group_uuid,
    rubric_item_uuid: rubric_item_uuid,
    status: status
  }).onConflict(["group_uuid", "rubric_item_uuid"]).merge();
}

export async function db_setManualGradingGroupFinished(
  group_uuid: string,
  finished: boolean) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_groups").where({
    group_uuid: group_uuid
  }).update({
    finished: finished
  });
}


export async function db_getManualGradingRecords(question_id: string) : Promise<ManualGradingQuestionRecords> {

  
  const question = await query("manual_grading_questions")
    .where({
      question_id: question_id
    })
    .select("*").first();
  
  const groups = await query("manual_grading_groups")
    .where({
      question_id: question_id
    })
    .select("*");
  
  const submissions = await query("manual_grading_submissions")
    .where({
      question_id: question_id
    })
    .select("*");

  const records = await query("manual_grading_records")
    .join('manual_grading_groups', 'manual_grading_groups.group_uuid', '=', 'manual_grading_records.group_uuid')
    .where({
      question_id: question_id
    })
    .select("manual_grading_records.group_uuid", "rubric_item_uuid", "status");

  const group_records_by_id : {[index: string]: ManualGradingGroupRecord } = {};
  groups.forEach(g => {
    group_records_by_id[g.group_uuid] = {
      group_uuid: g.group_uuid,
      grader: g.grader,
      submissions: [],
      grading_result: {}
    }
  });
  submissions.forEach(sub => {
    let record = group_records_by_id[sub.group_uuid];
    record.submissions.push({
      submission_uuid: sub.submission_uuid,
      uniqname: sub.uniqname,
      submission: sub.submission
    });
  });
  records.forEach(r => {
    let record = group_records_by_id[r.group_uuid];
    record.grading_result[r.rubric_item_uuid] = r.status;
  });

  return {
    question_id: question_id,
    groups: group_records_by_id,
    grading_epoch: question?.grading_epoch ?? 0
  }
}


