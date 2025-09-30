import { Knex } from "knex";

// This migration adds a missing index on the question_id column of
// the manual_grading_groups table.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("manual_grading_groups", table => {
    table.index("question_id");
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("manual_grading_groups", table => {
    table.dropIndex("question_id");
  });
}

