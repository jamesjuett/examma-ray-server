import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema

    .createTable("users", table => {
      table.string("email", 100).primary().notNullable();
      table.string("name", 100).notNullable();

      table.index("email");
    })

    .createTable("exams", table => {
      table.string("exam_id", 100).primary().notNullable();
      table.integer("epoch").notNullable();

      table.index("exam_id");
    })

    .createTable("exam_submissions", table => {
      table.uuid("uuid").primary().notNullable();
      table.string("exam_id", 100).notNullable();
      table.string("uniqname", 100).notNullable();
      table.string("name", 200).notNullable();

      table.index("uuid");
      table.index("exam_id");
      table.index("uniqname");
    })

    .createTable("manual_grading_questions", table => {
      table.string("question_id", 100).primary().notNullable();
      table.integer("grading_epoch").notNullable();

      table.index("question_id");
    })

    .createTable("manual_grading_question_skins", table => {
      table.string("question_id", 100).notNullable();
      table.string("skin_id", 250).notNullable();
      table.string("non_composite_skin_id", 100).nullable();
      table.jsonb("replacements");

      table.primary(["question_id", "skin_id"]);
      table.index("question_id", "skin_id");
    })

    .createTable("manual_grading_rubrics", table => {
      table.uuid("rubric_item_uuid").primary().notNullable();
      table.string("question_id", 100).notNullable()
        .references("question_id").inTable("manual_grading_questions").onDelete("restrict");
      table.double("points");
      table.text("title");
      table.text("description");
      table.boolean("active").notNullable().defaultTo(true);
      // table.timestamps(true, true);

      table.index("rubric_item_uuid");
      table.index("question_id");
    })

    .createTable("manual_grading_groups", table => {
      table.uuid("group_uuid").primary().notNullable(); // will be a uuidv4 for the grading group
      table.string("question_id", 100).notNullable()
        .references("question_id").inTable("manual_grading_questions").onDelete("restrict");
      table.boolean("finished").notNullable().defaultTo(false);
      // table.integer("grouper")
      //   .references("id").inTable("users").onDelete("restrict");
      table.string("grader", 100).nullable()
        .references("email").inTable("users").onDelete("restrict");
      // table.timestamps(true, true);

      table.index("group_uuid");
      table.index("grader");
    })

    .createTable("manual_grading_submissions", table => {
      table.uuid("submission_uuid").primary().notNullable();
      table.string("question_id", 100).notNullable()
        .references("question_id").inTable("manual_grading_questions").onDelete("restrict");
      table.string("skin_id", 100).notNullable()
      table.string("exam_id", 100).notNullable();
      table.uuid("group_uuid").nullable()
        .references("group_uuid").inTable("manual_grading_groups").onDelete("set null");
      table.string("uniqname", 100).notNullable();
      table.text("submission").notNullable();
      // table.timestamps(true, true);

      table.index("question_id");
      table.index("group_uuid");
      table.index("submission_uuid");
    })

    .createTable("manual_grading_records", table => {
      table.uuid("group_uuid").notNullable()
        .references("group_uuid").inTable("manual_grading_groups").onDelete("cascade");
      table.uuid("rubric_item_uuid").notNullable();
      table.string("status", 100).notNullable();
      table.text("notes").nullable();
      // table.timestamps(true, true);

      table.primary(["group_uuid", "rubric_item_uuid"]);

      table.index("group_uuid");
      table.index("rubric_item_uuid");
      table.index(["group_uuid", "rubric_item_uuid"]);
    })

    .createTable("manual_grading_code_grader_config", table => {
      table.string("question_id", 100).notNullable().primary()
        .references("question_id").inTable("manual_grading_questions").onDelete("restrict");
      table.text("test_harness").notNullable();
      table.text("grouping_function").notNullable();

      table.index("question_id");
    })

}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .dropTable("manual_grading_code_grader_config")
    .dropTable("manual_grading_records")
    .dropTable("manual_grading_submissions")
    .dropTable("manual_grading_groups")
    .dropTable("manual_grading_rubrics")
    .dropTable("manual_grading_question_skins")
    .dropTable("manual_grading_questions")
    .dropTable("submissions_list")
    .dropTable("exams")
    .dropTable("users");
}

