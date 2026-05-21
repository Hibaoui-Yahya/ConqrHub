import { Kysely, sql } from 'kysely';

/**
 * Add the missing foreign keys on `audit.actor_id` and `audit.space_id`.
 *
 * The original `audit` migration declared these columns as plain `uuid`
 * with no FK. When a user or space is deleted, audit rows silently keep
 * stale identifiers. Adding FKs with `ON DELETE SET NULL` keeps audit
 * history (rows survive the delete) while signalling at the schema level
 * that the original referent is gone.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Best-effort cleanup: NULL out any actor_id / space_id rows that point
  // to records that no longer exist. Without this, adding the FK would
  // fail validation on the existing rows.
  await sql`
    UPDATE audit
    SET actor_id = NULL
    WHERE actor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM users WHERE users.id = audit.actor_id)
  `.execute(db);

  await sql`
    UPDATE audit
    SET space_id = NULL
    WHERE space_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM spaces WHERE spaces.id = audit.space_id)
  `.execute(db);

  await sql`
    ALTER TABLE audit
    ADD CONSTRAINT audit_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  `.execute(db);

  await sql`
    ALTER TABLE audit
    ADD CONSTRAINT audit_space_id_fkey
    FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE SET NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE audit DROP CONSTRAINT IF EXISTS audit_actor_id_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE audit DROP CONSTRAINT IF EXISTS audit_space_id_fkey`.execute(
    db,
  );
}
