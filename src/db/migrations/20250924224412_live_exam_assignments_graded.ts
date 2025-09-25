import { Knex } from "knex";

// This migration adds a "graded" boolean column to live_exam_assignments
// to track whether an exam has been graded.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("live_exam_assignments", table => {
    table.boolean("graded").notNullable().defaultTo(false);
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("live_exam_assignments", table => {
    table.dropColumn("graded");
  });
}

