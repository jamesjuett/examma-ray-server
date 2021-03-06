import { ExamComponentSkin } from "examma-ray";
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


// SKINS

export async function db_getManualGradingQuestionSkins(question_id: string) {
  return await query("manual_grading_question_skins").where({
    question_id: question_id,
  }).select();
}

export async function db_getManualGradingQuestionSkin(question_id: string, skin_id: string) {
  return await query("manual_grading_question_skins").where({
    question_id: question_id,
    skin_id: skin_id
  }).select().first();
}

export async function db_insertManualGradingQuestionSkinIfNotExists(question_id: string, skin: ExamComponentSkin) {
  return await query("manual_grading_question_skins").insert({
    question_id: question_id,
    skin_id: skin.skin_id,
    non_composite_skin_id: skin.non_composite_skin_id,
    replacements: skin.replacements
  }).onConflict(["question_id", "skin_id"]).ignore().returning("*");
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
    active: rubric_item.active,
    sort_index: rubric_item.sort_index
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
    active: updates.active,
    sort_index: updates.sort_index
  });

}


export async function db_setManualGradingRecordStatus(
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

export async function db_setManualGradingRecordNotes(
  group_uuid: string,
  rubric_item_uuid: string,
  notes: string) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_records").insert({
    group_uuid: group_uuid,
    rubric_item_uuid: rubric_item_uuid,
    notes: notes
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
    .select("manual_grading_records.group_uuid", "rubric_item_uuid", "status", "notes");

  const group_records_by_id : {[index: string]: ManualGradingGroupRecord | undefined } = {};
  groups.forEach(g => {
    group_records_by_id[g.group_uuid] = {
      group_uuid: g.group_uuid,
      grader: g.grader,
      submissions: [],
      grading_result: {},
      finished: g.finished
    }
  });
  submissions.forEach(sub => {
    let record = group_records_by_id[sub.group_uuid];
    record?.submissions.push({
      submission_uuid: sub.submission_uuid,
      uniqname: sub.uniqname,
      submission: sub.submission,
      skin_id: sub.skin_id,
      exam_id: sub.exam_id,
      group_uuid: sub.group_uuid,
      question_id: sub.question_id
    });
  });
  records.forEach(r => {
    let record = group_records_by_id[r.group_uuid];
    if (record && (r.status || r.notes)) {
      record.grading_result[r.rubric_item_uuid] = {
        status: r.status,
        notes: r.notes
      };
    };
  });

  // Remove empty groups
  Object.entries(group_records_by_id).forEach(([group_uuid, group]) => {
    if (group!.submissions.length === 0) {
      delete group_records_by_id[group_uuid];
    }
  });

  return {
    question_id: question_id,
    groups: group_records_by_id,
    grading_epoch: question?.grading_epoch ?? 0
  }
}


