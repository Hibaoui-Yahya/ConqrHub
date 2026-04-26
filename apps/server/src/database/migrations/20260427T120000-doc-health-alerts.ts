import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('doc_health_alert_subscriptions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade'),
    )
    .addColumn('threshold', 'integer', (col) => col.notNull())
    .addColumn('last_fired_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // Partial unique indexes — same trick as snapshots, since space_id is nullable.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_health_alerts_user_workspace
      ON doc_health_alert_subscriptions (user_id, workspace_id)
      WHERE space_id IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_health_alerts_user_space
      ON doc_health_alert_subscriptions (user_id, workspace_id, space_id)
      WHERE space_id IS NOT NULL
  `.execute(db);

  await db.schema
    .createIndex('idx_doc_health_alerts_workspace')
    .ifNotExists()
    .on('doc_health_alert_subscriptions')
    .column('workspace_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_doc_health_alerts_workspace')
    .ifExists()
    .execute();
  await sql`DROP INDEX IF EXISTS uniq_doc_health_alerts_user_space`.execute(db);
  await sql`DROP INDEX IF EXISTS uniq_doc_health_alerts_user_workspace`.execute(
    db,
  );
  await db.schema
    .dropTable('doc_health_alert_subscriptions')
    .ifExists()
    .execute();
}
