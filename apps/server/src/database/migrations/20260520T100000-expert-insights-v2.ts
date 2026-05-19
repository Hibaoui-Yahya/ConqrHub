import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Enums first so column definitions can reference them.
  await sql`
    DO $$ BEGIN
      CREATE TYPE expert_insight_confidence AS ENUM ('low', 'medium', 'high');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  await sql`
    DO $$ BEGIN
      CREATE TYPE expert_insight_vote_kind AS ENUM ('helpful', 'not_helpful');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  // expert_insights — author snapshot + confidence + counters.
  await db.schema
    .alterTable('expert_insights')
    .addColumn('author_name', 'text')
    .addColumn('author_role', 'text')
    .addColumn('author_department', 'text')
    .addColumn('confidence', sql`expert_insight_confidence`, (col) =>
      col.notNull().defaultTo('medium'),
    )
    .addColumn('helpful_count', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .addColumn('not_helpful_count', 'integer', (col) =>
      col.notNull().defaultTo(0),
    )
    .execute();

  // users — nullable department column.
  await db.schema
    .alterTable('users')
    .addColumn('department', 'text')
    .execute();

  // attachments — nullable insight_id FK + partial index.
  await db.schema
    .alterTable('attachments')
    .addColumn('insight_id', 'uuid', (col) =>
      col.references('expert_insights.id').onDelete('cascade'),
    )
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachments_insight
    ON attachments(insight_id)
    WHERE insight_id IS NOT NULL
  `.execute(db);

  // expert_insight_votes.
  await db.schema
    .createTable('expert_insight_votes')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('insight_id', 'uuid', (col) =>
      col.notNull().references('expert_insights.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('vote', sql`expert_insight_vote_kind`, (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uniq_expert_insight_votes_user_insight', [
      'insight_id',
      'user_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_expert_insight_votes_insight')
    .ifNotExists()
    .on('expert_insight_votes')
    .column('insight_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('expert_insight_votes').ifExists().execute();

  await sql`DROP INDEX IF EXISTS idx_attachments_insight`.execute(db);
  await db.schema
    .alterTable('attachments')
    .dropColumn('insight_id')
    .execute();

  await db.schema.alterTable('users').dropColumn('department').execute();

  await db.schema
    .alterTable('expert_insights')
    .dropColumn('not_helpful_count')
    .dropColumn('helpful_count')
    .dropColumn('confidence')
    .dropColumn('author_department')
    .dropColumn('author_role')
    .dropColumn('author_name')
    .execute();

  await sql`DROP TYPE IF EXISTS expert_insight_vote_kind`.execute(db);
  await sql`DROP TYPE IF EXISTS expert_insight_confidence`.execute(db);
}
