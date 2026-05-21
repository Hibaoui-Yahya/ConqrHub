import { Kysely, sql } from 'kysely';

/**
 * Replace the default `ON DELETE RESTRICT` behavior on `ai_chats.creator_id`
 * with `ON DELETE SET NULL`. Previously, deleting a user with any AI chat
 * rows would fail with a foreign-key violation — even though the workspace
 * → user → chats cascade chain should have made user deletion succeed.
 *
 * `SET NULL` keeps historical chat rows (preserving conversation logs for
 * audit / billing) while letting the user delete succeed. The column is
 * relaxed to NULLABLE to allow the SET NULL action to apply.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE ai_chats ALTER COLUMN creator_id DROP NOT NULL`.execute(
    db,
  );

  // The original constraint was implicitly named by Postgres
  // (ai_chats_creator_id_fkey by Kysely's convention). Drop with
  // IF EXISTS so reruns are safe across environments with slightly
  // different naming history.
  await sql`ALTER TABLE ai_chats DROP CONSTRAINT IF EXISTS ai_chats_creator_id_fkey`.execute(
    db,
  );

  await sql`
    ALTER TABLE ai_chats
    ADD CONSTRAINT ai_chats_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE ai_chats DROP CONSTRAINT IF EXISTS ai_chats_creator_id_fkey`.execute(
    db,
  );

  // Recreate the original constraint (default RESTRICT) — but we cannot
  // restore the NOT NULL without rewriting any NULL rows that accumulated
  // while the column was nullable. Best to leave the column nullable on
  // rollback; the foreign key alone is enough to undo the security fix.
  await sql`
    ALTER TABLE ai_chats
    ADD CONSTRAINT ai_chats_creator_id_fkey
    FOREIGN KEY (creator_id) REFERENCES users(id)
  `.execute(db);
}
