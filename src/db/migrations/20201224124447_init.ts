import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema

    .createTable("users", table => {
      table.increments("id").primary();
      table.string("email", 100).notNullable();
      table.string("name", 100).notNullable();

      table.index("id");
      table.index("email");
    })

    .createTable("manual_grading_rubrics", table => {
      table.string("question_id", 100).notNullable();
      table.string("rubric_item_id", 100).notNullable();
      table.double("points");
      table.text("title");
      table.text("description");
      table.boolean("active").notNullable().defaultTo(true);
      // table.timestamps(true, true);

      table.primary(["question_id", "rubric_item_id"]);

      table.index("question_id");
    })

    .createTable("manual_grading_groups", table => {
      table.uuid("group_uuid").primary().notNullable(); // will be a uuidv4 for the grading group
      table.string("question_id", 100).notNullable();
      table.string("exam_id", 100).notNullable();
      // table.integer("grouper")
      //   .references("id").inTable("users").onDelete("restrict");
      // table.integer("grader")
      //   .references("id").inTable("users").onDelete("restrict");
      // table.timestamps(true, true);

      // table.index("group_uuid");
      // table.index("grader");
    })

    .createTable("manual_grading_submissions", table => {
      table.uuid("submission_uuid").primary().notNullable();
      table.uuid("group_uuid").notNullable()
        .references("group_uuid").inTable("manual_grading_groups").onDelete("set null");
      table.string("uniqname", 100).notNullable();
      table.text("submission").notNullable();
      // table.timestamps(true, true);

      table.index("group_uuid");
      table.index("submission_uuid");
    })

    .createTable("manual_grading_records", table => {
      table.uuid("group_uuid").notNullable()
        .references("group_uuid").inTable("manual_grading_groups").onDelete("cascade");
      table.string("rubric_item_id", 100).notNullable();
      table.string("status", 100).nullable();
      // table.timestamps(true, true);

      table.primary(["group_uuid", "rubric_item_id"]);

      table.index("group_uuid");
      table.index("rubric_item_id");
      table.index(["group_uuid", "rubric_item_id"]);
    })

}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .dropTable("manual_grading_records")
    .dropTable("manual_grading_submissions")
    .dropTable("manual_grading_groups")
    .dropTable("manual_grading_rubrics")
    .dropTable("users");
}

