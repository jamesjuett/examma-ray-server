import { Knex } from "knex";
import { DB_Exams, Tables } from "knex/types/tables";
import { v4 as uuidv4 } from "uuid";

// This migration adds a randomization_seed column to the live_exam_instances table.
// It used to be that the exam_id was used as the randomization seed, but now
// that there can be multiple instances of an exam, each instance needs its own seed.
// For any previously existing exam instances, the seed is set to the exam_id
// of the corresponding exam.

export async function up(knex: Knex): Promise<void> {
  
  await knex.schema
    .alterTable("live_exam_instances", table => {
      table.string("randomization_seed", 100).notNullable().after("uuidv5_namespace");
    });

  // for all existing exam instances, copy the existing exam_id from the exams table
  const insts = await knex("live_exam_instances").select("*");
  await Promise.all(insts.map(async i => {
    const exam = await knex("exams").where({exam_id: i.exam_id}).select("exam_id").first();
    if (!exam) {
      // this should be true since it's a foreign key, so something is wrong if not
      throw new Error(`No exam found for exam_id ${i.exam_id}`);
    }
    
    // The funky Tables["live_exam_instances"]["update"] cast below is needed because the typings
    // normally wouldn't allow updating the randomization_seed column. The cast says nah it's ok.
    await knex("live_exam_instances").where({exam_instance_uuid: i.exam_instance_uuid}).update({
      randomization_seed: exam.exam_id
    } as Tables["live_exam_instances"]["update"]);
  }));
}


export async function down(knex: Knex): Promise<void> {

  return knex.schema
    .alterTable("live_exam_instances", table => {
      table.dropColumn("randomization_seed");
    });
}

