import { firstResult, query } from "./db";


export async function db_getParticipation(exam_id: string, email: string) {
  return await query("participation").where({exam_id: exam_id, email: email}).select().first();
}

export async function db_getAllParticipation(email: string) {
  return await query("participation").where({email: email}).select();
}
export async function db_setParticipation(exam_id: string, email: string) {
  return firstResult(await query("participation")
    .insert({
      exam_id: exam_id,
      email: email
    })
    .returning("*"));
}