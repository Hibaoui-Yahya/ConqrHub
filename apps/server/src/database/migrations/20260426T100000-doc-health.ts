import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('owner_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('idx_pages_space_id_owner_id')
    .ifNotExists()
    .on('pages')
    .columns(['space_id', 'owner_id'])
    .execute();

  await db.schema
    .createIndex('idx_pages_workspace_id_updated_at')
    .ifNotExists()
    .on('pages')
    .columns(['workspace_id', 'updated_at'])
    .execute();

  await db.schema
    .alterTable('spaces')
    .addColumn('is_critical', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('spaces').dropColumn('is_critical').execute();

  await db.schema
    .dropIndex('idx_pages_workspace_id_updated_at')
    .ifExists()
    .execute();

  await db.schema
    .dropIndex('idx_pages_space_id_owner_id')
    .ifExists()
    .execute();

  await db.schema.alterTable('pages').dropColumn('owner_id').execute();
}
