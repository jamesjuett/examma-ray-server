import { Knex } from "knex";

// This migration renames the start_time and end_time columns in live_windows
// to open_time and close_time, which are more clear.

export async function up(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_windows", table => {
    table.renameColumn("start_time", "open_time");
    table.renameColumn("end_time", "close_time");
  });

}


export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable("live_windows", table => {
    table.renameColumn("open_time", "start_time");
    table.renameColumn("close_time", "end_time");
  });
}

