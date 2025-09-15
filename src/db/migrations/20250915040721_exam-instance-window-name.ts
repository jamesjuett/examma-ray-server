import { Knex } from "knex";

// This migration adds a name column to the live_windows table.

export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("live_windows", table => {
      table.string("name", 100).nullable().after("uniqname");
    });
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("live_windows", table => {
      table.dropColumn("name");
    });
}

