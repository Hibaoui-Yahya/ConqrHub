import { Kysely, sql } from 'kysely';

/**
 * Saved AI insights of a meeting (ConqrMeet): an "AI communication
 * analysis" of the speakers, or a question asked about the meeting with its
 * answer. ConqrMeet produced both through POST /api/ai/generate and kept
 * them nowhere; they are now saved per meeting, by the people who may edit
 * it, and read by everyone who may read it.
 *
 * Its own table rather than meetings.settings: settings is rewritten whole
 * by several paths (markers, evaluation, publication), and a list people
 * add to and delete from would lose writes there.
 *
 * Additive. Rows follow their meeting: a soft-deleted meeting keeps them
 * (hidden with the meeting), a hard-deleted one removes them (cascade).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('meeting_insights')
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
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('question', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('transcript_version', 'integer')
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      'meeting_insights_kind_check',
      sql`kind in ('communication-analysis', 'qa')`,
    )
    .execute();

  await db.schema
    .createIndex('meeting_insights_meeting_idx')
    .ifNotExists()
    .on('meeting_insights')
    .columns(['meeting_id', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('meeting_insights').ifExists().execute();
}
