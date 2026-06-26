import { Kysely, sql } from 'kysely';

/**
 * Adds a 'stopping' value to the `meeting_status` enum so the meeting
 * service can atomically transition out of 'recording' before assembling
 * the transcript, blocking any further `ingestChunk` calls from racing
 * against the transcript assembly.
 *
 * IMPORTANT: `ALTER TYPE ... ADD VALUE` interacts badly with transactions:
 *   - On Postgres < 12 it cannot run inside a transaction block at all.
 *   - On Postgres >= 12 it runs inside a transaction but the value cannot
 *     be referenced until the transaction commits.
 * Kysely's migrator wraps each migration in a transaction by default
 * (no per-migration disable option), so we use a DO $$ ... END $$ block
 * with an explicit pg_enum existence check. This keeps the migration
 * idempotent across reruns and avoids the duplicate-value error path.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'stopping'
          AND enumtypid = 'meeting_status'::regtype
      ) THEN
        ALTER TYPE meeting_status ADD VALUE 'stopping' AFTER 'recording';
      END IF;
    END $$;
  `.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // Postgres does not support removing values from an enum without
  // recreating the type and rewriting every dependent row. Leave the
  // value in place on rollback — it is a strict superset of the original
  // enum and harmless if unused.
}
