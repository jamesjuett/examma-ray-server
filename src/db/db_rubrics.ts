import { ManualGradingGroupRecord, ManualGradingQuestionRecord, ManualGradingRubricItemStatus } from "../manual_grading";
import { query } from "./db";

export async function db_getManualGradingRubricById(question_id: string) {
  return await query("manual_grading_rubrics").where({question_id: question_id}).select();
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
  status?: ManualGradingRubricItemStatus) {

  // Create and get a copy of the new rubric item
  return await query("manual_grading_records").insert({
    group_uuid: group_uuid,
    rubric_item_id: rubric_item_id,
    status: status
  }).returning("*");
}



export async function db_getManualGradingRecords(question_id: string) {

  
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
    .select("manual_grading_records.group_uuid", "rubric_item_id", "status");

  const group_records_by_id : {[index: string]: ManualGradingGroupRecord } = {};
  groups.forEach(g => {
    group_records_by_id[g.group_uuid] = {
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
    record.grading_result[r.rubric_item_id] = r.status;
  });

  return <ManualGradingQuestionRecord>{
    question_id: question_id,
    groups: Object.values(group_records_by_id),
  }
}
