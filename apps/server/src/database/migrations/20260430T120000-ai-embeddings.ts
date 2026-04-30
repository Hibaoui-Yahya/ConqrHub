import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  await sql`
    DO $$ BEGIN
      CREATE TYPE ai_source_kind AS ENUM ('page', 'expert_insight', 'external_document');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `.execute(db);

  await db.schema
    .createTable('ai_embeddings')
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
    .addColumn('source_kind', sql`ai_source_kind`, (col) => col.notNull())
    .addColumn('source_id', 'uuid', (col) => col.notNull())
    .addColumn('chunk_index', 'integer', (col) => col.notNull())
    .addColumn('chunk_text', 'text', (col) => col.notNull())
    .addColumn('embedding', sql`vector(1024)`, (col) => col.notNull())
    .addColumn('model', 'text', (col) => col.notNull())
    .addColumn('dim', 'integer', (col) => col.notNull())
    .addColumn('content_hash', 'text', (col) => col.notNull())
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // HNSW index for cosine-distance nearest-neighbour search.
  // m=16, ef_construction=64 are the pgvector recommended starting defaults.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ai_embeddings_hnsw
    ON ai_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `.execute(db);

  await db.schema
    .createIndex('idx_ai_embeddings_workspace')
    .ifNotExists()
    .on('ai_embeddings')
    .column('workspace_id')
    .execute();

  await db.schema
    .createIndex('idx_ai_embeddings_source')
    .ifNotExists()
    .on('ai_embeddings')
    .columns(['workspace_id', 'source_kind', 'source_id'])
    .execute();

  // Unique constraint that powers idempotent upserts on re-index.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_embeddings_chunk
    ON ai_embeddings (source_kind, source_id, chunk_index, model)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ai_embeddings').ifExists().execute();
  await sql`DROP TYPE IF EXISTS ai_source_kind`.execute(db);
  // The vector extension is left installed — other features may rely on it.
}
