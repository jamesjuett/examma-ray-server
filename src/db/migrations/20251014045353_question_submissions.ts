import { Knex } from "knex";
import { updated_at_trigger_down, updated_at_trigger_up } from "../migration_util";

// This migration adds a question_submissions table.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("question_submissions", (table) => {
    table.string("question_id").notNullable();
    table.uuid("assigned_exam_uuid").notNullable();
    table.uuid("exam_instance_uuid").notNullable();
    table.string("exam_id").notNullable();
    table.string("uniqname", 100).notNullable();
    table.jsonb("submission").notNullable();
    table.timestamps(true, true);
    
    // TODO: later add a foreign key for question_id, but we don't have a questions table yet
    table.foreign("exam_id").references("exams.exam_id").onDelete("restrict");
    table.foreign("exam_instance_uuid").references("exam_instances.exam_instance_uuid").onDelete("restrict");
    table.foreign("assigned_exam_uuid").references("exam_submissions.uuid").onDelete("restrict");

    table.primary(["question_id", "assigned_exam_uuid"]);
    // table.index(["question_id", "assigned_exam_uuid"]); // unnecessary since primary key already does this
    table.index(["question_id", "uniqname"]);
    table.index(["question_id", "exam_instance_uuid"]);
    table.index(["question_id", "exam_id"]);

    // we don't add indexes here on exam_id, exam_instance_uuid, or assigned_exam_uuid on their
    // own since this table is probably not the best source of "full exam info". should be used
    // for individual question submissions.
  });
  await updated_at_trigger_up(knex.schema, "question_submissions");
}


export async function down(knex: Knex): Promise<void> {
  await updated_at_trigger_down(knex.schema, "question_submissions");
  await knex.schema.dropTableIfExists("question_submissions");
}

