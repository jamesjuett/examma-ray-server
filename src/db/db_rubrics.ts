import { query } from "./db";

export namespace DB {

  export async function getManualGradingRubricById(question_id: string) {
    return await query("manual_grading_rubrics").where({question_id: question_id}).select();
  }
  
  export async function getManualGradingRecords(group_uuid: string) {
    return await query("manual_grading_records").where({
      group_uuid: group_uuid
    }).select("rubric_item_id", "status");
  }
  
  export async function getGroupSubmissions(group_uuid: string) {
    return await query("manual_grading_submissions").where({
      group_uuid: group_uuid
    }).select("*");
  }
  
  export async function createManualGradingRubricItem(
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
    }).returning("*").first();
  }

}

