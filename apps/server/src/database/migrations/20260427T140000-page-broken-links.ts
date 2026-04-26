import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('page_broken_links')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.notNull().references('pages.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.notNull().references('spaces.id').onDelete('cascade'),
    )
    .addColumn('target_url', 'text', (col) => col.notNull())
    .addColumn('kind', sql`varchar(16)`, (col) => col.notNull())
    .addColumn('http_status', 'integer')
    .addColumn('reason', sql`varchar(32)`, (col) => col.notNull())
    .addColumn('last_checked_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('uniq_page_broken_links_page_target', [
      'page_id',
      'target_url',
    ])
    .execute();

  await db.schema
    .createIndex('idx_page_broken_links_workspace')
    .ifNotExists()
    .on('page_broken_links')
    .columns(['workspace_id', 'last_checked_at desc'])
    .execute();

  await db.schema
    .createIndex('idx_page_broken_links_space')
    .ifNotExists()
    .on('page_broken_links')
    .column('space_id')
    .execute();

  await db.schema
    .createIndex('idx_page_broken_links_page')
    .ifNotExists()
    .on('page_broken_links')
    .column('page_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_page_broken_links_page')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('idx_page_broken_links_space')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('idx_page_broken_links_workspace')
    .ifExists()
    .execute();
  await db.schema.dropTable('page_broken_links').ifExists().execute();
}
