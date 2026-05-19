import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('meetings')
    .addColumn('ai_outputs', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('meetings').dropColumn('ai_outputs').execute();
}
