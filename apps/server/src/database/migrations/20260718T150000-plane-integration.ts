import { type Kysely, sql } from 'kysely';

/**
 * Conqr Integration Layer schema (blueprint §8).
 *
 * These tables belong to the Integration Layer only. They store cross-product
 * relationships, project↔space mappings, a webhook inbox (dedup), and an event
 * outbox/audit trail. They never mirror Plane's canonical work data or Hub's
 * canonical documents — those stay in their owning products.
 *
 * Every table is tenant-scoped by workspace_id.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // --- Typed relationships (edges) ----------------------------------------
  await db.schema
    .createTable('integration_relationships')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('source_urn', 'varchar', (col) => col.notNull())
    .addColumn('source_type', 'varchar', (col) => col.notNull())
    .addColumn('target_urn', 'varchar', (col) => col.notNull())
    .addColumn('target_type', 'varchar', (col) => col.notNull())
    .addColumn('relation_type', 'varchar', (col) => col.notNull())
    .addColumn('inverse_relation_type', 'varchar', (col) => col.notNull())
    .addColumn('lifecycle_state', 'varchar', (col) =>
      col.notNull().defaultTo('active'),
    )
    .addColumn('provenance', 'varchar')
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('source_version', 'jsonb')
    .addColumn('metadata', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    // Idempotent: the same directed typed edge exists at most once per tenant.
    .addUniqueConstraint('integration_relationships_edge_unique', [
      'workspace_id',
      'source_urn',
      'target_urn',
      'relation_type',
    ])
    .execute();

  await db.schema
    .createIndex('integration_relationships_source_idx')
    .on('integration_relationships')
    .columns(['workspace_id', 'source_urn'])
    .execute();

  await db.schema
    .createIndex('integration_relationships_target_idx')
    .on('integration_relationships')
    .columns(['workspace_id', 'target_urn'])
    .execute();

  // --- Project ↔ space mappings (blueprint §8.3) --------------------------
  await db.schema
    .createTable('integration_project_space_mappings')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('plane_project_id', 'varchar', (col) => col.notNull())
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    // 'primary' (one per project) or 'secondary' (zero or more).
    .addColumn('mapping_kind', 'varchar', (col) =>
      col.notNull().defaultTo('primary'),
    )
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('deleted_at', 'timestamptz')
    .addUniqueConstraint('integration_project_space_mappings_unique', [
      'workspace_id',
      'plane_project_id',
      'space_id',
    ])
    .execute();

  // At most one primary space per (workspace, plane project).
  await sql`
    CREATE UNIQUE INDEX integration_mapping_one_primary_idx
    ON integration_project_space_mappings (workspace_id, plane_project_id)
    WHERE mapping_kind = 'primary' AND deleted_at IS NULL
  `.execute(db);

  // --- Webhook inbox / delivery dedup (blueprint §8.4, §9.4) --------------
  await db.schema
    .createTable('integration_webhook_deliveries')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('source', 'varchar', (col) => col.notNull().defaultTo('plane'))
    // Delivery id from X-Plane-Delivery — unique to dedup at-least-once delivery.
    .addColumn('delivery_id', 'varchar', (col) => col.notNull())
    .addColumn('event_type', 'varchar')
    .addColumn('signature_valid', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('status', 'varchar', (col) =>
      col.notNull().defaultTo('received'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('error', 'varchar')
    .addColumn('received_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('processed_at', 'timestamptz')
    .addUniqueConstraint('integration_webhook_deliveries_delivery_id_unique', [
      'source',
      'delivery_id',
    ])
    .execute();

  // --- Event outbox / cross-product audit (blueprint §8.4, §9.5) ----------
  await db.schema
    .createTable('integration_events')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('type', 'varchar', (col) => col.notNull())
    .addColumn('source', 'varchar', (col) => col.notNull())
    .addColumn('subject', 'varchar', (col) => col.notNull())
    .addColumn('correlation_id', 'varchar', (col) => col.notNull())
    .addColumn('causation_id', 'varchar')
    .addColumn('actor_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('data', 'jsonb')
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('pending'))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('published_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('integration_events_correlation_idx')
    .on('integration_events')
    .columns(['workspace_id', 'correlation_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('integration_events').ifExists().execute();
  await db.schema
    .dropTable('integration_webhook_deliveries')
    .ifExists()
    .execute();
  await db.schema
    .dropTable('integration_project_space_mappings')
    .ifExists()
    .execute();
  await db.schema.dropTable('integration_relationships').ifExists().execute();
}
