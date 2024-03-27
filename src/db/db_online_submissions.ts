import { firstResult, query } from "./db";


export async function db_getOnlineSubmission(exam_id: string, email: string) {
  return query("online_submissions").where({exam_id: exam_id, email: email}).select().first();
}

export async function db_setOnlineSubmission(exam_id: string, email: string, submission: string) {
  await query("online_submissions").insert({
    exam_id: exam_id,
    email: email,
    submission: submission,
  }).onConflict(["exam_id", "email"]).merge();
  return db_getOnlineSubmission(exam_id, email);
}