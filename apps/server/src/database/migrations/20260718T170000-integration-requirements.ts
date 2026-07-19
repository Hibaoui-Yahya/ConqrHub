import { type Kysely, sql } from 'kysely';

/**
 * Requirement-block lifecycle store (blueprint §6.2). One row per tracked
 * requirement block on a Hub page, carrying its stable id and lifecycle state
 * so coverage/traceability can be computed against delivery work.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('integration_requirements')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    // The requirement block anchor within the page (client-generated stable id).
    .addColumn('block_id', 'varchar', (col) => col.notNull())
    .addColumn('title', 'varchar')
    .addColumn('state', 'varchar', (col) => col.notNull().defaultTo('draft'))
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('integration_requirements_block_unique', [
      'workspace_id',
      'page_id',
      'block_id',
    ])
    .execute();

  await db.schema
    .createIndex('integration_requirements_state_idx')
    .on('integration_requirements')
    .columns(['workspace_id', 'state'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('integration_requirements').ifExists().execute();
}
