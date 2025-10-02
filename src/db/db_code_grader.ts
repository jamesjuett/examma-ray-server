import { pick, query } from "./db";
import { v4 as uuidv4 } from "uuid";
import { ManualCodeGraderConfiguration } from "../manual_grading";


export async function db_getCodeGraderConfig(manual_grader_uuid: string) {
  return await query("manual_grading_code_grader_config").where({
    manual_grader_uuid: manual_grader_uuid
  }).select("*").first();
}

export async function db_createCodeGraderConfig(manual_grader_uuid: string, test_harness: string, grouping_function: string) {
  return await query("manual_grading_code_grader_config").insert({
    manual_grader_uuid: manual_grader_uuid,
    test_harness: test_harness,
    grouping_function: grouping_function
  }).returning("*");
}

export async function db_updateCodeGraderConfig(manual_grader_uuid: string, edits: Partial<Pick<ManualCodeGraderConfiguration, "test_harness" | "grouping_function">>) {
  return await query("manual_grading_code_grader_config").where({
    manual_grader_uuid: manual_grader_uuid
  }).update(pick(edits, ["test_harness", "grouping_function"])).returning("*");
}



export async function db_getGroup(
  group_uuid: string
) {

  return await query("manual_grading_groups").where({
    group_uuid: group_uuid,
  }).select().first();
}

export async function db_createGroup(
  group_uuid: string,
  manual_grader_uuid: string,
  finished?: boolean,
  grader?: string,
) {

  return await query("manual_grading_groups").insert({
    group_uuid: group_uuid,
    manual_grader_uuid: manual_grader_uuid,
    finished: finished,
    grader: grader
  }).returning("*");
}



export async function db_createSubmission(
  submission_uuid: string,
  manual_grader_uuid: string,
  skin_id: string,
  exam_id: string,
  uniqname: string,
  submission: string,
  group_uuid?: string
) {
  
  if (!group_uuid) {
    // create new group for this submission
    group_uuid = uuidv4();
    await query("manual_grading_groups").insert({
      group_uuid: group_uuid,
      manual_grader_uuid: manual_grader_uuid
    });
  }


  return await query("manual_grading_submissions").insert({
    submission_uuid: submission_uuid,
    manual_grader_uuid: manual_grader_uuid,
    skin_id: skin_id,
    exam_id: exam_id,
    group_uuid: group_uuid,
    uniqname: uniqname,
    submission: submission,
  }).returning("*");
}

export async function db_setSubmissionGroup(submission_uuid: string, group_uuid: string) {
  return await query("manual_grading_submissions").where({
    submission_uuid: submission_uuid
  }).update({
    group_uuid: group_uuid
  });
}

export async function db_deleteManualGradingBySubmission(exam_id: string, uniqname: string) {
  return await query("manual_grading_submissions").where({
    exam_id: exam_id,
    uniqname: uniqname
  }).delete();
}

export async function db_deleteManualGradingByExam(exam_id: string) {
  return await query("manual_grading_submissions").where({
    exam_id: exam_id
  }).delete();
}

export async function getAllSubmissions(manual_grader_uuid: string) {
  return await query("manual_grading_submissions").where({
    manual_grader_uuid: manual_grader_uuid
  }).select("*");
}

export async function getAllGroups(manual_grader_uuid: string) {
  return await query("manual_grading_groups").where({
    manual_grader_uuid: manual_grader_uuid
  }).select("*");
}

// export async function getGroupSubmissions(group_uuid: string) {
//   return await query("manual_grading_submissions").where({
//     group_uuid: group_uuid
//   }).select("*");
// }

