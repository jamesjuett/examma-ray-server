import { Knex } from "knex";
import { updated_at_trigger_down, updated_at_trigger_up } from "../migration_util";

// This migration renames the question_id column on several manual grading
// tables to manual_grader_uuid. It does not change to a uuid type - they
// remain a string for now but in a future migration we may change the type
// of that column. Doing so would require making uuids for each of the old
// question_ids that got used.

// Then, it adds a new table that maps from a question_id and an exam_id to
// a manual_grader_uuid. Each question_id is mapped to itself for now.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("manual_grading_code_grader_config", table => {
    table.renameColumn("question_id", "manual_grader_uuid");
  })
  .alterTable("manual_grading_questions", table => {
    table.renameColumn("question_id", "manual_grader_uuid");
  })
  .alterTable("manual_grading_question_skins", table => {
    table.renameColumn("question_id", "manual_grader_uuid");
  })
  .alterTable("manual_grading_rubrics", table => {
    table.renameColumn("question_id", "manual_grader_uuid");
  })
  .alterTable("manual_grading_groups", table => {
    table.renameColumn("question_id", "manual_grader_uuid");
  })
  .alterTable("manual_grading_submissions", table => {
    table.renameColumn("question_id", "manual_grader_uuid");
  })
  .createTable("exams_questions_to_manual_grader", table => {
    table.string("exam_id").notNullable();
    table.string("question_id").notNullable();
    table.string("manual_grader_uuid").references("manual_grader_uuid").inTable("manual_grading_questions").onDelete("restrict");
    table.timestamps(true, true);

    table.primary(["exam_id", "question_id"]);
  });

  await updated_at_trigger_up(knex.schema, "exams_questions_to_manual_grader");

  const old_questions_ids = await knex("manual_grading_questions").select("*");
  await knex("exams_questions_to_manual_grader").insert(
    old_questions_ids.map((q) => ({
      exam_id: q.exam_id,
      question_id: q.manual_grader_uuid,
      manual_grader_uuid: q.manual_grader_uuid,
    }))
  );
}


export async function down(knex: Knex): Promise<void> {

  await updated_at_trigger_down(knex.schema, "exams_questions_to_manual_grader");
  await knex.schema.dropTableIfExists("exams_questions_to_manual_grader");
  
  return knex.schema.alterTable("manual_grading_submissions", table => {
    table.renameColumn("manual_grader_uuid", "question_id");
  })
  .alterTable("manual_grading_groups", table => {
    table.renameColumn("manual_grader_uuid", "question_id");
  })
  .alterTable("manual_grading_rubrics", table => {
    table.renameColumn("manual_grader_uuid", "question_id");
  })
  .alterTable("manual_grading_question_skins", table => {
    table.renameColumn("manual_grader_uuid", "question_id");
  })
  .alterTable("manual_grading_questions", table => {
    table.renameColumn("manual_grader_uuid", "question_id");
  })
  .alterTable("manual_grading_code_grader_config", table => {
    table.renameColumn("manual_grader_uuid", "question_id");
  })
  
}









