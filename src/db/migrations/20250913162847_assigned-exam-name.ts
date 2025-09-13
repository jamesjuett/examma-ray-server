import { Knex } from "knex";

// This migration adds a name column to the live_exam_assignments table.

export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("live_exam_assignments", table => {
      table.string("name", 100).nullable().after("uniqname");
    });
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("live_exam_assignments", table => {
      table.dropColumn("name");
    });
}

