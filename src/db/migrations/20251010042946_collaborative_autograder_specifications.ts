import { Knex } from "knex";
import { updated_at_trigger_down, updated_at_trigger_up } from "../migration_util";


export async function up(knex: Knex): Promise<void> {
  
  await knex.schema.renameTable("live_exam_instances", "exam_instances");

  await knex.schema.createTable("collaborative_grading_servers", table => {
    table.increments("grading_server_pk").primary();
    table.string("question_id").notNullable();
    table.enum("grader_kind", [
      "manual_regex_fill_in_the_blank",
      "simple_multiple_choice",
      "summation_multiple_choice",
      "standard_select_lines",
      "standard_fitb_drop",
      "bug_catching",
    ]).notNullable();
    table.integer("epoch").notNullable().defaultTo(0);
    table.timestamps(true, true);

    table.index("question_id");
  });
  await updated_at_trigger_up(knex.schema, "collaborative_grading_servers");

  await knex.schema.createTable("exam_instances_collaborative_grading_servers", table => {
    table.uuid("exam_instance_uuid").notNullable().references("exam_instance_uuid").inTable("exam_instances").onDelete("restrict");

    // denormalization intended - otherwise it's harder to enforece that an exam instance can't be
    // associated with multiple collaborative grading servers for the same question
    table.string("question_id").notNullable();

    table.integer("grading_server_pk").notNullable().references("grading_server_pk").inTable("collaborative_grading_servers").onDelete("cascade");
    table.timestamps(true, true);
    table.primary(["exam_instance_uuid", "question_id"]);
    table.index(["grading_server_pk"]);
  });
  await updated_at_trigger_up(knex.schema, "exam_instances_collaborative_grading_servers");
  
  await knex.schema.createTable("fitb_drop_rubric_items", table => {
    table.string("rubric_item_uuid").primary();
    table.integer("grading_server_pk").notNullable().references("grading_server_pk").inTable("collaborative_grading_servers").onDelete("cascade");
    table.string("title").notNullable();
    table.double("points").notNullable();
    table.text("description").notNullable();
    table.enum("policy", ["first_match", "best_score"]).notNullable();
    table.string("sort_index").notNullable().defaultTo("");
    table.boolean("active").notNullable().defaultTo(true);
    table.timestamps(true, true);

    table.index(["grading_server_pk"]);
  });
  await updated_at_trigger_up(knex.schema, "fitb_drop_rubric_items");

  await knex.schema.createTable("fitb_drop_rubric_item_evaluators", table => {
    table.string("evaluator_uuid").primary();
    table.string("rubric_item_uuid").notNullable().references("rubric_item_uuid").inTable("fitb_drop_rubric_items").onDelete("cascade");
    table.jsonb("spec").notNullable();
    table.string("sort_index").notNullable().defaultTo("");
    table.timestamps(true, true);

    table.index(["rubric_item_uuid"]);
  });
  await updated_at_trigger_up(knex.schema, "fitb_drop_rubric_item_evaluators");

}


export async function down(knex: Knex): Promise<void> {

  await updated_at_trigger_down(knex.schema, "fitb_drop_rubric_item_evaluators");
  await knex.schema.dropTableIfExists("fitb_drop_rubric_item_evaluators");

  await updated_at_trigger_down(knex.schema, "fitb_drop_rubric_items");
  await knex.schema.dropTableIfExists("fitb_drop_rubric_items");

  await updated_at_trigger_down(knex.schema, "exam_instances_collaborative_grading_servers");
  await knex.schema.dropTableIfExists("exam_instances_collaborative_grading_servers");

  await updated_at_trigger_down(knex.schema, "collaborative_grading_servers");
  await knex.schema.dropTableIfExists("collaborative_grading_servers");

  await knex.schema.renameTable("exam_instances", "live_exam_instances");

}

