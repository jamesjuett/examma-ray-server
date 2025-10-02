import { ExamComponentSkin } from "examma-ray";
import { Tables } from "knex/types/tables";
import { ManualGradingGroupRecord, ManualGradingQuestionRecords, ManualGradingRubricItem, ManualGradingRubricItemStatus } from "../manual_grading";
import { query } from "./db";

export async function db_getManualGradingQuestion(manual_grader_uuid: string) {
  return await query("manual_grading_questions").where({manual_grader_uuid: manual_grader_uuid}).select().first();
}

export async function db_setManualGradingQuestion(
  manual_grader_uuid: string,
  grading_epoch: number) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_questions").insert({
    manual_grader_uuid: manual_grader_uuid,
    grading_epoch: grading_epoch
  }).onConflict("manual_grader_uuid").merge();
}


// SKINS

export async function db_getManualGradingQuestionSkins(manual_grader_uuid: string) {
  return await query("manual_grading_question_skins").where({
    manual_grader_uuid: manual_grader_uuid,
  }).select();
}

export async function db_getManualGradingQuestionSkin(manual_grader_uuid: string, skin_id: string) {
  return await query("manual_grading_question_skins").where({
    manual_grader_uuid: manual_grader_uuid,
    skin_id: skin_id
  }).select().first();
}

export async function db_insertManualGradingQuestionSkinIfNotExists(manual_grader_uuid: string, skin: ExamComponentSkin) {
  return await query("manual_grading_question_skins").insert({
    manual_grader_uuid: manual_grader_uuid,
    skin_id: skin.skin_id,
    non_composite_skin_id: skin.non_composite_skin_id,
    replacements: skin.replacements
  }).onConflict(["manual_grader_uuid", "skin_id"]).ignore().returning("*");
}






export async function db_getManualGradingRubric(manual_grader_uuid: string) {
  return await query("manual_grading_rubrics").where({manual_grader_uuid: manual_grader_uuid}).select();
}

export async function db_getGroupSubmissions(group_uuid: string) {
  return await query("manual_grading_submissions").where({
    group_uuid: group_uuid
  }).select("*");
}

export async function db_getManualGradingRubricItem(manual_grader_uuid: string, rubric_item_uuid: string) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_rubrics").where({
    manual_grader_uuid: manual_grader_uuid,
    rubric_item_uuid: rubric_item_uuid
  }).select().first();
}

export async function db_createManualGradingRubricItem(manual_grader_uuid: string, rubric_item_uuid: string, rubric_item: ManualGradingRubricItem) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_rubrics").insert({
    manual_grader_uuid: manual_grader_uuid,
    rubric_item_uuid: rubric_item_uuid,
    points: rubric_item.points,
    title: rubric_item.title,
    description: rubric_item.description,
    active: rubric_item.active,
    sort_index: rubric_item.sort_index
  }).returning("*");
}

export async function db_updateManualGradingRubricItem(manual_grader_uuid: string, rubric_item_uuid: string, updates: Partial<ManualGradingRubricItem>) {

  return await query("manual_grading_rubrics").where({
    manual_grader_uuid: manual_grader_uuid,
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


export async function db_getManualGradingRecords(manual_grader_uuid: string) : Promise<ManualGradingQuestionRecords> {

  
  const question = await query("manual_grading_questions")
    .where({
      manual_grader_uuid: manual_grader_uuid
    })
    .select("*").first();
  
  const groups = await query("manual_grading_groups")
    .where({
      manual_grader_uuid: manual_grader_uuid
    })
    .select("*");
  
  const submissions = await query("manual_grading_submissions")
    .where({
      manual_grader_uuid: manual_grader_uuid
    })
    .select("*");

  const records = await query("manual_grading_records")
    .join('manual_grading_groups', 'manual_grading_groups.group_uuid', '=', 'manual_grading_records.group_uuid')
    .where({
      manual_grader_uuid: manual_grader_uuid
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
      manual_grader_uuid: sub.manual_grader_uuid
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
    manual_grader_uuid: manual_grader_uuid,
    groups: group_records_by_id,
    grading_epoch: question?.grading_epoch ?? 0
  }
}


