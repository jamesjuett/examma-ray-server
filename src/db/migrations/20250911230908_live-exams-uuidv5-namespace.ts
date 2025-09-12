import { Knex } from "knex";
import { DB_Exams, Tables } from "knex/types/tables";
import { v4 as uuidv4 } from "uuid";

// There used to be only one instance for a particular exam, represented by the exams table.
// Now, there can be multiple instances of an exam, represented by the live_exam_instances table.
// This migration allows each instance to have its own UUIDv5 namespace. Specifically, it:
//   1. Adds a uuidv5_namespace column to the live_exam_instances table
//   2. For each existing exam instance, copies the old uuidv5_namespace from the corresponding exam in the exams table
//   3. For any exams that don't have a corresponding instance, creates a new instance with the old uuidv5_namespace
//   4. Drops the uuidv5_namespace column from the exams table

export async function up(knex: Knex): Promise<void> {
  
  await knex.schema
    .alterTable("live_exam_instances", table => {
      table.uuid("uuidv5_namespace").notNullable().defaultTo(knex.raw('gen_random_uuid()')).after("exam_id");
    });

  // for all existing exam instances, copy the existing uuidv5_namespace from the exams table
  const insts = await knex("live_exam_instances").select("*");
  await Promise.all(insts.map(async i => {
    const old_uuidv5 = await knex("exams").where({exam_id: i.exam_id}).select("uuidv5_namespace").first();
    if (!old_uuidv5) {
      // this should be true since it's a foreign key, so something is wrong if not
      throw new Error(`No exam found for exam_id ${i.exam_id}`);
    }

    // The funky Tables["live_exam_instances"]["update"] cast below is needed because the typings
    // normally wouldn't allow updating the uuidv5_namespace column. The cast says nah it's ok.
    await knex("live_exam_instances").where({exam_instance_uuid: i.exam_instance_uuid}).update({
      uuidv5_namespace: old_uuidv5.uuidv5_namespace
    } as Tables["live_exam_instances"]["update"]);
  }));

  // for any exams that don't have a corresponding instance, create one with the old uuidv5_namespace
  const exams = await knex("exams").select("*");
  await Promise.all(exams.map(async exam => {
    const existing_inst = await knex("live_exam_instances").where({exam_id: exam.exam_id}).first();
    if (!existing_inst) {
      await knex("live_exam_instances").insert({
        exam_instance_uuid: uuidv4(),
        exam_id: exam.exam_id,
        duration_seconds: 60*60, // default to 1 hour
        uuidv5_namespace: (exam as DB_Exams & {uuidv5_namespace: string}).uuidv5_namespace // cast since typings don't have uuidv5_namespace here anymore
      } as Tables["live_exam_instances"]["insert"]);
    }
  }));

  // finally, drop the uuidv5_namespace column from the exams table
  return await knex.schema.alterTable("exams", table => {
    table.dropColumn("uuidv5_namespace");
  });

}


export async function down(knex: Knex): Promise<void> {
  
  await knex.schema
    .alterTable("exams", table => {
      table.uuid("uuidv5_namespace").notNullable().defaultTo(knex.raw('gen_random_uuid()')).after("exam_id");
    });

  // for all existing exams, copy the existing uuidv5_namespace from one of the corresponding instances
  const exams = await knex("exams").select("*");
  await Promise.all(exams.map(async exam => {
    const inst = await knex("live_exam_instances").where({exam_id: exam.exam_id}).select("uuidv5_namespace").first();
    if (!inst) {
      throw new Error(`No live exam instance found for exam_id ${exam.exam_id}`);
    }
    
    // The funky Tables["live_exam_instances"]["update"] cast below is needed because the typings
    // normally wouldn't allow updating the uuidv5_namespace column. The cast says nah it's ok.
    await knex("exams").where({exam_id: exam.exam_id}).update({
      uuidv5_namespace: inst.uuidv5_namespace
    } as Tables["exams"]["update"]);
  }));

  // finally, drop the uuidv5_namespace column from the live_exam_instances table
  return await knex.schema.alterTable("live_exam_instances", table => {
    table.dropColumn("uuidv5_namespace");
  });
}

