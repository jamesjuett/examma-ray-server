import { firstResult, query } from "./db";


export async function db_getParticipation(exam_id: string, email: string) {
  return query("participation").where({exam_id: exam_id, email: email}).select().first();
}

export async function db_getAllParticipationForUser(email: string) {
  return query("participation").where({email: email}).select();
}

export async function db_getAllParticipation() {
  return query("participation").select();
}

/**
 * Sets participation in the databse, unless it was already there. In that
 * case, does nothing.
 * @param exam_id 
 * @param email 
 * @returns 
 */
export async function db_setParticipation(exam_id: string, email: string) {
  return await db_getParticipation(exam_id, email)
    ?? firstResult(await query("participation").insert({
      exam_id: exam_id,
      email: email
    }).returning("*"));
}