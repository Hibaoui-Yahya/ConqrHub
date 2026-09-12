import { type Kysely, sql } from 'kysely';

/**
 * Conqr tenant → ConqrHub workspace, for platform mode.
 *
 * A binding is a deliberate administrative act, recorded once, never inferred at login. Creating a
 * workspace during an authentication would produce one with no owner, no audit trail and nobody
 * who decided it should exist — so a person entitled to an unbound tenant is refused rather than
 * accommodated.
 *
 * Nothing here affects standalone mode: the table is empty and unread unless
 * `CONQR_PLATFORM_MODE=platform`.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('platform_tenant_bindings')
    .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    // The Conqr tenant URN, exactly as it appears in a TenantContext. Stored as given so a lookup
    // is a string comparison against what the context carries, with no parsing in between.
    .addColumn('conqr_tenant_id', 'varchar', (col) => col.notNull())
    // The Conqr application id this binding is for. A tenant may run several applications; a
    // binding is only ever meaningful for one of them.
    .addColumn('application_id', 'varchar', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('active'))
    .addColumn('revision', 'bigint', (col) => col.notNull().defaultTo(1))
    .addColumn('created_by', 'uuid', (col) => col.references('users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  // One live binding per (tenant, application). Two bindings for the same pair would make "which
  // workspace is this tenant's" ambiguous, and the resolution would depend on row order.
  await db.schema
    .createIndex('platform_tenant_bindings_unique_live')
    .on('platform_tenant_bindings')
    .columns(['conqr_tenant_id', 'application_id'])
    .unique()
    .where(sql.ref('status'), '=', 'active')
    .execute();

  // And one live binding per workspace: a workspace belongs to one tenant, or the tenant boundary
  // is not a boundary.
  await db.schema
    .createIndex('platform_tenant_bindings_unique_workspace')
    .on('platform_tenant_bindings')
    .columns(['workspace_id'])
    .unique()
    .where(sql.ref('status'), '=', 'active')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('platform_tenant_bindings').execute();
}
