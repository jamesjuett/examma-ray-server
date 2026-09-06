import { Knex } from "knex";

// This migration makes duration_seconds on exam_instances (renamed from
// live_exam_instances) nullable. A null duration means the exam has no time limit.

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("exam_instances", table => {
    table.integer("duration_seconds").nullable().alter();
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex("exam_instances").whereNull("duration_seconds").update({
    duration_seconds: 60 * 60, // default to 1 hour
  });
  return knex.schema.alterTable("exam_instances", table => {
    table.integer("duration_seconds").notNullable().alter();
  });
}
