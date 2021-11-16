import { firstResult, query } from "./db";

export async function db_getOrCreateUser(email: string) {
  let user = await query("users")
    .where({email: email})
    .select().first();

  if (!user) {
    user = firstResult(await query("users")
      .insert({
        email: email,
        name: email // set initial name to their email, can change later
      })
      .returning("*"));
  }

  return user;
}



export async function db_getUserByEmail(email: string) {
  return await query("users")
    .where({email: email})
    .select().first();
}