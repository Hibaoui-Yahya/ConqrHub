import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$ BEGIN
      CREATE TYPE meeting_status AS ENUM ('recording', 'finalizing', 'completed', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  await sql`
    DO $$ BEGIN
      CREATE TYPE meeting_source AS ENUM ('mic', 'system');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  await db.schema
    .createTable('meetings')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('status', sql`meeting_status`, (col) =>
      col.notNull().defaultTo('recording'),
    )
    .addColumn('transcript', 'text')
    .addColumn('started_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('ended_at', 'timestamptz')
    .addColumn('duration_ms', 'integer', (col) => col.defaultTo(0))
    .addColumn('settings', 'jsonb', (col) => col.defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('meetings_workspace_user_started_idx')
    .ifNotExists()
    .on('meetings')
    .columns(['workspace_id', 'user_id', 'started_at desc'])
    .execute();

  await db.schema
    .createTable('meeting_segments')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('source', sql`meeting_source`, (col) => col.notNull())
    .addColumn('sequence', 'integer', (col) => col.notNull())
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('start_ms', 'integer', (col) => col.notNull())
    .addColumn('duration_ms', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('meeting_segments_meeting_seq_idx')
    .ifNotExists()
    .on('meeting_segments')
    .columns(['meeting_id', 'source', 'sequence'])
    .execute();

  await db.schema
    .createIndex('meeting_segments_meeting_start_idx')
    .ifNotExists()
    .on('meeting_segments')
    .columns(['meeting_id', 'start_ms'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('meeting_segments').ifExists().execute();
  await db.schema.dropTable('meetings').ifExists().execute();
  await sql`DROP TYPE IF EXISTS meeting_source`.execute(db);
  await sql`DROP TYPE IF EXISTS meeting_status`.execute(db);
}
