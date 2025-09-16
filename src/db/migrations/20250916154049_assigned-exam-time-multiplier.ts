import { Knex } from "knex";

// This migration adds an duration_multiplier column to
// live_exam_assignments, which records a multiplier to the exam duration
// for a given student (e.g. 1.5x time for students with accommodations).

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_exam_assignments", table => {
    table.float("duration_multiplier").notNullable().defaultTo(1.0);
  });
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_exam_assignments", table => {
    table.dropColumn("duration_multiplier");
  });
}

