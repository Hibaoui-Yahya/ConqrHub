import { Kysely, sql } from 'kysely';

/**
 * Meeting sharing, phase 1 (LTC, after Strict Private phase 0). The person
 * who created a meeting may let named colleagues, or the members of a
 * group, read it. One row per grant: a user OR a group, never both. Only
 * "viewer" exists: changing a meeting stays with its creator.
 *
 * Additive. Rows follow their meeting, user and group: a hard delete of any
 * of them removes the grant (cascade); a soft-deleted meeting is invisible
 * to everyone whatever its grants.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('meeting_shares')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade'),
    )
    .addColumn('group_id', 'uuid', (col) =>
      col.references('groups.id').onDelete('cascade'),
    )
    .addColumn('role', 'text', (col) => col.notNull().defaultTo('viewer'))
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint('meeting_shares_role_check', sql`role in ('viewer')`)
    .addCheckConstraint(
      'meeting_shares_one_target_check',
      sql`num_nonnulls(user_id, group_id) = 1`,
    )
    .execute();

  // One grant per meeting and person, per meeting and group.
  await sql`create unique index if not exists meeting_shares_meeting_user_uniq
    on meeting_shares (meeting_id, user_id) where user_id is not null`.execute(db);
  await sql`create unique index if not exists meeting_shares_meeting_group_uniq
    on meeting_shares (meeting_id, group_id) where group_id is not null`.execute(db);
  // "Shared with me": by person, by group.
  await sql`create index if not exists meeting_shares_user_idx
    on meeting_shares (user_id) where user_id is not null`.execute(db);
  await sql`create index if not exists meeting_shares_group_idx
    on meeting_shares (group_id) where group_id is not null`.execute(db);

  // Who granted or took back what, and when. Its own table: the processing
  // timeline (meeting_processing_events) dates the last pipeline activity,
  // and a share must not make a stuck run look alive. Kept when the person
  // or group goes (no foreign key on them); removed with the meeting.
  await db.schema
    .createTable('meeting_share_audit')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('actor_id', 'uuid')
    .addColumn('action', 'text', (col) => col.notNull())
    .addColumn('user_id', 'uuid')
    .addColumn('group_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'meeting_share_audit_action_check',
      sql`action in ('added', 'removed')`,
    )
    .execute();
  await sql`create index if not exists meeting_share_audit_meeting_idx
    on meeting_share_audit (meeting_id, created_at)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('meeting_share_audit').ifExists().execute();
  await db.schema.dropTable('meeting_shares').ifExists().execute();
}
