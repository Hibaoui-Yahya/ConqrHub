import { Kysely, sql } from 'kysely';

/**
 * Fencing token of the meeting pipeline (LTC-01). `processing_run_id` names
 * the one processing run allowed to write a meeting's transcript, outputs,
 * documents, proposals and status. A new run, a person's retry, the
 * stalled-run sweep or a deletion replaces or clears it, and every pipeline
 * write checks it under the meeting's row lock — so a run that timed out,
 * lost its BullMQ lock or was superseded can never commit late results.
 *
 * Additive and nullable: existing rows keep NULL (no run in flight).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS processing_run_id uuid,
      ADD COLUMN IF NOT EXISTS processing_run_at timestamptz
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE meetings
      DROP COLUMN IF EXISTS processing_run_at,
      DROP COLUMN IF EXISTS processing_run_id
  `.execute(db);
}
