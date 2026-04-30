import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$ BEGIN
      CREATE TYPE expert_insight_type AS ENUM (
        'warning', 'correction', 'notice', 'recommendation'
      );
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  await sql`
    DO $$ BEGIN
      CREATE TYPE expert_insight_status AS ENUM ('draft', 'published', 'retired');
    EXCEPTION WHEN duplicate_object THEN null; END $$
  `.execute(db);

  await db.schema
    .createTable('expert_insights')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('insight_type', sql`expert_insight_type`, (col) => col.notNull())
    .addColumn('status', sql`expert_insight_status`, (col) =>
      col.notNull().defaultTo('draft'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('published_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('published_at', 'timestamptz')
    .addColumn('expires_at', 'timestamptz')
    .addColumn('retired_at', 'timestamptz')
    .addColumn('span_anchor', 'jsonb')
    // Full-text search vector — generated from title + body.
    .addColumn('tsv', sql`tsvector GENERATED ALWAYS AS (
      to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))
    ) STORED`)
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_expert_insights_workspace')
    .ifNotExists()
    .on('expert_insights')
    .column('workspace_id')
    .execute();

  // Primary access pattern: fetch published insights for a page.
  await db.schema
    .createIndex('idx_expert_insights_page_status')
    .ifNotExists()
    .on('expert_insights')
    .columns(['page_id', 'status'])
    .execute();

  // FTS on published insights.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_expert_insights_tsv
    ON expert_insights USING gin(tsv)
    WHERE deleted_at IS NULL
  `.execute(db);

  // Efficient auto-retire sweep.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_expert_insights_expires
    ON expert_insights (expires_at)
    WHERE expires_at IS NOT NULL AND status = 'published' AND deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('expert_insights').ifExists().execute();
  await sql`DROP TYPE IF EXISTS expert_insight_status`.execute(db);
  await sql`DROP TYPE IF EXISTS expert_insight_type`.execute(db);
}
