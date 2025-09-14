import { Knex } from "knex";

// This migration adds a name column to the live_exam_instances table so
// that an instance can be identified by a human-friendly name (e.g.
// "Quiz 1 Fall 2025") as well as the primary key UUID.

export async function up(knex: Knex): Promise<void> {
  await knex.schema
    .alterTable("live_exam_instances", table => {
      table.string("name", 200).notNullable().defaultTo("").after("exam_instance_uuid");
    });

  // for all existing exam instances, set the name to the exam_id of the corresponding exam
  const insts = await knex("live_exam_instances").select("*");
  await Promise.all(insts.map(async i => {
    const exam = await knex("exams").where({exam_id: i.exam_id}).select("exam_id").first();
    if (!exam) {
      // this should be true since it's a foreign key, so something is wrong if not
      throw new Error(`No exam found for exam_id ${i.exam_id}`);
    }
    
    await knex("live_exam_instances").where({exam_instance_uuid: i.exam_instance_uuid}).update({
      name: exam.exam_id
    });
  }));
}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .alterTable("live_exam_instances", table => {
      table.dropColumn("name");
    });
}

