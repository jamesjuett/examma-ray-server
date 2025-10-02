import { Knex } from "knex";
import { updated_at_trigger_down, updated_at_trigger_up } from "../migration_util";

// This migration adds the following tables to the database:
// - courses: stores information about courses
// - course_users: associates users (by login google email) with courses

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("courses", table => {
    table.increments("course_pk").primary(); // primary key
    table.string("subject_code").notNullable();
    table.string("course_number").notNullable();
    table.string("term").notNullable();
    table.integer("year").notNullable();
    table.string("title").notNullable();
    table.timestamps(true, true);
  });

  await updated_at_trigger_up(knex.schema, "courses");

  await knex.schema.createTable("course_users", table => {
    table.integer("course_pk").notNullable().references("course_pk").inTable("courses").onDelete("cascade");
    table.string("email").notNullable();
    table.enum("role", ["student", "staff", "admin"]).notNullable();
    table.timestamps(true, true);

    table.primary(["course_pk", "email"]);
    table.index(["email"]);
    table.index(["course_pk", "role"]);
  });
  await updated_at_trigger_up(knex.schema, "course_users");

  await knex.schema.createTable("course_sections", table => {
    table.increments("section_pk").primary(); // primary key
    table.integer("course_pk").notNullable().references("course_pk").inTable("courses").onDelete("cascade");
    table.string("section_id").notNullable();
    table.string("section_name").notNullable();
    table.timestamps(true, true);

    table.unique(["course_pk", "section_id"]);
    table.index(["course_pk"]);
  });
  await updated_at_trigger_up(knex.schema, "course_sections");

  await knex.schema.createTable("user_sections", table => {
    table.string("email").notNullable();
    table.integer("section_pk").notNullable().references("section_pk").inTable("course_sections").onDelete("cascade");
    table.timestamps(true, true);

    // Searches will potentially search by either email or section_pk, or both.
    table.primary(["email", "section_pk"]);
    table.index(["section_pk"]); // foreign key index
  });
  await updated_at_trigger_up(knex.schema, "user_sections");

  await knex.schema.createTable("course_schedules", table => {
    table.increments("schedule_pk").primary(); // primary key
    table.integer("course_pk").notNullable().references("course_pk").inTable("courses").onDelete("cascade");
    table.string("name").notNullable();
    table.timestamps(true, true);

    table.index(["course_pk"]); // foreign key index
  });
  await updated_at_trigger_up(knex.schema, "course_schedules");

  await knex.schema.createTable("schedule_offset_items", table => {
    table.increments("offset_item_pk").primary();
    table.integer("schedule_pk").notNullable().references("schedule_pk").inTable("course_schedules").onDelete("cascade");
    table.integer("section_pk").nullable().references("section_pk").inTable("course_sections").onDelete("cascade");
    table.integer("day_offset").notNullable(); // how far from first day schedule is applied (0 = first day of schedule)
    table.integer("hour").notNullable(); // absolute hour of the day, 0-23
    table.integer("minute").notNullable(); // absolute minute of the hour, 0-59
    table.integer("second").notNullable(); // absolute second of the minute, 0-59
    table.timestamps(true, true);

    // schedule pk and section pk must be unique
    
    // Searches will potentially search by either schedule_pk or both,
    // but not by section_pk on its own.
    table.unique(["schedule_pk", "section_pk"]); // also foreign key index on schedule_pk
    table.index(["section_pk"]); // foreign key index
  });
  await updated_at_trigger_up(knex.schema, "schedule_offset_items");
}


export async function down(knex: Knex): Promise<void> {

  await updated_at_trigger_down(knex.schema, "schedule_offset_items");
  await knex.schema.dropTableIfExists("schedule_offset_items");

  await updated_at_trigger_down(knex.schema, "course_schedules");
  await knex.schema.dropTableIfExists("course_schedules");

  await updated_at_trigger_down(knex.schema, "user_sections");
  await knex.schema.dropTableIfExists("user_sections");

  await updated_at_trigger_down(knex.schema, "course_sections");
  await knex.schema.dropTableIfExists("course_sections");

  await updated_at_trigger_down(knex.schema, "course_users");
  await knex.schema.dropTableIfExists("course_users");

  await updated_at_trigger_down(knex.schema, "courses");
  await knex.schema.dropTableIfExists("courses");

}

