import { Kysely, sql } from 'kysely';

/**
 * Invitation links are valid for one week. `expires_at` is set on creation
 * and moved forward whenever an administrator resends the invitation or
 * copies its link.
 *
 * Invitations already pending when this runs get a full week from now, so no
 * one invited before the change is cut off by it. Additive only.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspace_invitations')
    .addColumn('expires_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now() + interval '7 days'`),
    )
    .execute();

  await sql`UPDATE workspace_invitations SET expires_at = now() + interval '7 days' WHERE expires_at IS NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspace_invitations')
    .dropColumn('expires_at')
    .execute();
}
