import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // PG >= 12 allows ADD VALUE inside a transaction as long as the new value
  // is not used in the same transaction — we don't use it here.
  await sql`ALTER TYPE ai_source_kind ADD VALUE IF NOT EXISTS 'plane_work_item'`.execute(
    db,
  );
}

export async function down(_db: Kysely<any>): Promise<void> {
  // PostgreSQL cannot remove enum values; rolling back is a no-op.
  // Rows with source_kind = 'plane_work_item' are cleaned by the AI queue's
  // delete jobs, not by schema rollback.
}
