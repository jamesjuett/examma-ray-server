import { Knex } from "knex";

// This migration adds indices for:
//  - start_time
//  - duration_multiplier)
// to the live_exam_assignments table

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_exam_assignments", table => {
    table.index("start_time");
    table.index("duration_multiplier");
  });
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_exam_assignments", table => {
    table.dropIndex("duration_multiplier");
    table.dropIndex("start_time");
  });
}

