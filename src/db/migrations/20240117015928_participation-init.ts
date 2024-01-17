import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  return knex.schema

    .createTable("participation", table => {
      table.string("exam_id", 100).notNullable();
      table.string("email", 100).notNullable();
      table.timestamps(true, true);

      table.primary(["exam_id", "email"]);

      table.index("exam_id");
      table.index("email");
      table.index(["exam_id", "email"]);
    })

}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .dropTable("participation");
}

