import { query } from "./db";

export async function db_getSubmissionsList(exam_id: string) {
  return await query("submissions_list").where({exam_id: exam_id}).select();
}