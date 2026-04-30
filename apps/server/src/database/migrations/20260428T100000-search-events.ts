import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('search_events')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('event_type', 'varchar', (col) => col.notNull())
    .addColumn('query', 'text', (col) => col.notNull())
    .addColumn('result_count', 'integer')
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('idx_search_events_workspace_created')
    .ifNotExists()
    .on('search_events')
    .columns(['workspace_id', 'created_at desc'])
    .execute();

  // Used by the success-ratio join: match a click event back to its query
  // event by (workspace, user, query, time-window).
  await db.schema
    .createIndex('idx_search_events_match')
    .ifNotExists()
    .on('search_events')
    .columns(['workspace_id', 'user_id', 'query', 'created_at'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('idx_search_events_match').ifExists().execute();
  await db.schema
    .dropIndex('idx_search_events_workspace_created')
    .ifExists()
    .execute();
  await db.schema.dropTable('search_events').ifExists().execute();
}
