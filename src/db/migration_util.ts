import { Knex } from "knex";

export function updated_at_trigger_up(schema: Knex.SchemaBuilder, table_name: string) {
  return schema.raw(`
    CREATE OR REPLACE FUNCTION ${table_name}_updated_at_auto_update()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW."updated_at" = now();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `).raw(`
    CREATE TRIGGER ${table_name}_updated_at_trigger BEFORE UPDATE
    ON ${table_name} FOR EACH ROW EXECUTE FUNCTION
    ${table_name}_updated_at_auto_update();
  `);
}

export function updated_at_trigger_down(schema: Knex.SchemaBuilder, table_name: string) {
  // While the trigger would be dropped if its table is dropped, the function wouldn't be.
  // However, we go ahead and remove them both, since it that preserved correctness for
  // up vs. down on the auto-updating behavior even if the table isn't being created/removed.
  return schema.raw(`
    DROP TRIGGER IF EXISTS ${table_name}_updated_at_trigger ON ${table_name};
  `).raw(`
    DROP FUNCTION IF EXISTS ${table_name}_updated_at_auto_update();
  `);
}