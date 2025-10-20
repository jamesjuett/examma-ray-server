import { Knex } from "knex";

// This migration adds a "name" field to the fitb_drop_rubric_item_evaluators table

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("fitb_drop_rubric_item_evaluators", table => {
    table.string("name").notNullable().defaultTo("");
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("fitb_drop_rubric_item_evaluators", table => {
    table.dropColumn("name");
  });
}

