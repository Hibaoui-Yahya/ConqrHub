import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // pg_trgm is already installed by an earlier migration
  // (20250729T213756-add-unaccent-pg_trm-update-tsvector). We rely on the
  // similarity() operator + a GIN trigram index for fast duplicate lookups
  // without pulling in any embedding model. Real semantic detection lands
  // in v2 once the AI Search analytics infrastructure exists.

  await db.schema
    .createTable('page_duplicates')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('duplicate_of_page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('similarity', 'real', (col) => col.notNull())
    .addColumn('detected_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    // (page_id, duplicate_of_page_id) is unique — prevents two rows for the
    // same pair, even though the relation is symmetric. We store both
    // directions explicitly so a single per-page lookup is O(rows-for-page).
    .addUniqueConstraint('uniq_page_duplicates_pair', [
      'page_id',
      'duplicate_of_page_id',
    ])
    .execute();

  await db.schema
    .createIndex('idx_page_duplicates_workspace')
    .ifNotExists()
    .on('page_duplicates')
    .columns(['workspace_id', 'detected_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_page_duplicates_page')
    .ifNotExists()
    .on('page_duplicates')
    .column('page_id')
    .execute();

  // GIN trigram indexes on the columns we'll be similarity-joining on.
  // Without these, the per-workspace self-join is O(n²) sequential scan;
  // with them, Postgres uses the index to prune candidates first.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pages_title_trgm
    ON pages USING gin (title gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_pages_text_content_trgm
    ON pages USING gin (text_content gin_trgm_ops)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_pages_text_content_trgm`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_pages_title_trgm`.execute(db);
  await db.schema
    .dropIndex('idx_page_duplicates_page')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('idx_page_duplicates_workspace')
    .ifExists()
    .execute();
  await db.schema.dropTable('page_duplicates').ifExists().execute();
}
