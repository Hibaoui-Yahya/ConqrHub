import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('doc_health_snapshots')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade'),
    )
    .addColumn('captured_at', 'timestamptz', (col) => col.notNull())
    .addColumn('score', 'integer')
    .addColumn('signals', 'jsonb', (col) => col.notNull())
    .addColumn('page_count', 'integer', (col) => col.notNull())
    .addColumn('scored_page_count', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // One row per (scope, day). Two partial unique indexes — one for workspace-level
  // rows (space_id IS NULL) and one for per-space rows — because Postgres treats
  // NULL as distinct in a regular unique index, which would let duplicates through.
  await db.schema
    .createIndex('uniq_doc_health_snapshots_workspace_day')
    .ifNotExists()
    .on('doc_health_snapshots')
    .columns(['workspace_id', 'captured_at'])
    .where('space_id', 'is', null)
    .unique()
    .execute();

  await db.schema
    .createIndex('uniq_doc_health_snapshots_space_day')
    .ifNotExists()
    .on('doc_health_snapshots')
    .columns(['workspace_id', 'space_id', 'captured_at'])
    .where('space_id', 'is not', null)
    .unique()
    .execute();

  await db.schema
    .createIndex('idx_doc_health_snapshots_trend')
    .ifNotExists()
    .on('doc_health_snapshots')
    .columns(['workspace_id', 'space_id', 'captured_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_doc_health_snapshots_captured_at')
    .ifNotExists()
    .on('doc_health_snapshots')
    .column('captured_at')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_doc_health_snapshots_captured_at')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('idx_doc_health_snapshots_trend')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('uniq_doc_health_snapshots_space_day')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('uniq_doc_health_snapshots_workspace_day')
    .ifExists()
    .execute();
  await db.schema.dropTable('doc_health_snapshots').ifExists().execute();
}
