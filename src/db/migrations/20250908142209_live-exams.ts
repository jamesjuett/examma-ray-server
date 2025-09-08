import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  return knex.schema

    // .createTable("online_submissions", table => {
    //   table.string("exam_id", 100).notNullable();
    //   table.string("email", 100).notNullable();
    //   table.timestamps(true, true);
    //   table.jsonb("submission");

    //   table.primary(["exam_id", "email"]);

    //   table.index("exam_id");
    //   table.index("email");
    //   table.index(["exam_id", "email"]);
    // })
    .createTable("live_exam_instances", table => {
      table.string("exam_id", 100).notNullable()
        .references("exam_id").inTable("exams").onDelete("restrict");
      table.integer("duration_seconds").notNullable();
      table.primary(["exam_id"]);

      table.index("exam_id");
    })
    .createTable("live_exam_assignments", table => {
      table.string("exam_uuid", 100).notNullable();
      table.string("exam_id", 100).notNullable()
        .references("exam_id").inTable("exams").onDelete("restrict");
      table.string("uniqname", 100).notNullable();
      table.string("student_email", 100).notNullable();
      table.integer("window_id").nullable()
        .references("window_id").inTable("live_windows").onDelete("restrict");
      table.boolean("force_open").notNullable().defaultTo(false);
      table.primary(["exam_uuid"]);

      table.index("exam_uuid");
      table.index("exam_id");
      table.index("uniqname");
      table.index("student_email");
      table.index("window_id");
    })
    .createTable("live_windows", table => {
      table.increments("window_id").primary();
      table.string("exam_id", 100).notNullable()
        .references("exam_id").inTable("exams").onDelete("restrict");
      table.timestamp("start_time").notNullable();
      table.timestamp("end_time").notNullable();
      
      table.index("window_id");
      table.index("exam_id");
    })
    .createTable("live_submissions", table => {
      table.string("exam_uuid", 100).notNullable()
        .references("exam_uuid").inTable("live_exam_assignments").onDelete("restrict");
      table.string("uniqname", 100).notNullable();
      table.string("updated_by_email", 100).notNullable();
      table.timestamps(true, true);
      table.jsonb("submission");
      table.primary(["exam_uuid"]);

      table.index("exam_uuid");
      table.index("uniqname");
      table.index("updated_by_email");
    });

}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .dropTable("online_submissions");
}

