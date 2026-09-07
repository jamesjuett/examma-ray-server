import { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  return knex.schema
    .createTable("live_exam_instances", table => {
      table.uuid("exam_instance_uuid").primary().notNullable();
      table.string("exam_id", 100).notNullable()
        .references("exam_id").inTable("exams").onDelete("restrict");
      table.integer("duration_seconds").notNullable();

      table.index("exam_instance_uuid");
      table.index("exam_id");
    })
    .createTable("live_windows", table => {
      table.uuid("window_uuid").primary().notNullable();
      table.uuid("exam_instance_uuid").notNullable()
        .references("exam_instance_uuid").inTable("live_exam_instances").onDelete("restrict");
      table.timestamp("start_time").notNullable();
      table.timestamp("end_time").notNullable();
      
      table.index("window_uuid");
      table.index("exam_instance_uuid");
    })
    .createTable("live_exam_assignments", table => {
      table.uuid("exam_uuid").primary().notNullable();
      table.uuid("exam_instance_uuid").notNullable()
        .references("exam_instance_uuid").inTable("live_exam_instances").onDelete("restrict");
      table.string("uniqname", 100).notNullable();
      table.string("student_email", 100).notNullable();
      table.uuid("window_uuid").nullable()
        .references("window_uuid").inTable("live_windows").onDelete("restrict");
      table.boolean("force_open").notNullable().defaultTo(false);

      table.index("exam_uuid");
      table.index("exam_instance_uuid");
      table.index("uniqname");
      table.index("student_email");
      table.index("window_uuid");
    })
    .createTable("live_submissions", table => {
      table.uuid("exam_uuid").primary().notNullable()
        .references("exam_uuid").inTable("live_exam_assignments").onDelete("restrict");
      table.string("updated_by_email", 100).notNullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.jsonb("submission");

      table.index("exam_uuid");
      table.index("updated_by_email");
    });

}


export async function down(knex: Knex): Promise<void> {
  return knex.schema
    .dropTable("live_submissions")
    .dropTable("live_exam_assignments")
    .dropTable("live_windows")
    .dropTable("live_exam_instances");
}

