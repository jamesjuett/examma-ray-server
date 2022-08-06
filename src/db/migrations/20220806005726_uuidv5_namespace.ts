import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  
  await knex.schema

    .alterTable("exams", table => {
      table.uuid("uuidv5_namespace").notNullable().defaultTo(knex.raw('gen_random_uuid()')).after("exam_id");
    });

}


export async function down(knex: Knex): Promise<void> {
  
  return knex.schema

    .alterTable("exams", table => {
      table.dropColumn("uuid");
    });
}

