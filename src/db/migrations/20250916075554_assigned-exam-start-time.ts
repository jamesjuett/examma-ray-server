import { Knex } from "knex";

// This migration adds a start_time column to live_exam_assignments,
// which records when a student first opens their exam.

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_exam_assignments", table => {
    table.timestamp("start_time").nullable().defaultTo(null);
  });
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_exam_assignments", table => {
    table.dropColumn("start_time");
  });
}

