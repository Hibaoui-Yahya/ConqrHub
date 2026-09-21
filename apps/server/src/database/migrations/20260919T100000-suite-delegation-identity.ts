import { type Kysely, sql } from 'kysely';

/**
 * Shared-identity mapping for cross-product delegation.
 *
 * A suite product acting on behalf of a person in ConqrHub cannot send a Hub
 * user id — it does not have one, and it must not, because that would make
 * Hub's id space meaningful in somebody else's database. What every product
 * does share is the identity provider: the `sub` of the token it verified, and
 * the organisation claim in it. This migration is what lets Hub turn those two
 * values back into its own user and workspace.
 *
 * Three pieces:
 *
 * 1. `auth_accounts.idp_key` — the existing SSO table already stores
 *    `provider_user_id`, which is exactly the subject we need. What it lacked
 *    was a way to say *which* provider issued it: `auth_provider_id` points at
 *    a per-workspace `auth_providers` row, and the shared suite IdP is
 *    configured by environment instead, so those rows carry NULL there. A
 *    NULLable column cannot carry a unique constraint in Postgres — NULLs are
 *    distinct — so the shared-IdP rows are keyed by this column instead.
 *
 * 2. `suite_org_identity` — the organisation half. One row per organisation,
 *    not one per user, because the identity provider already holds the person
 *    and this only has to say which Hub workspace an organisation *is*.
 *
 * 3. `suite_delegation_audit` — every delegated request, accepted or refused.
 *
 * Matching on email was the alternative and is the thing this exists to stop.
 * An address can be reassigned, so anyone able to set one in Hub could choose
 * which person in another product they become. A provider subject cannot be
 * reassigned, which is the whole reason it is the join key.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // --- 1. The person half ---------------------------------------------------
  await db.schema
    .alterTable('auth_accounts')
    .addColumn('idp_key', 'varchar')
    .execute();

  // Partial, and deliberately so. It covers only the shared-IdP rows, which
  // leaves every existing per-workspace SSO row exactly as it was, and it
  // excludes soft-deleted rows so a removed account does not block the same
  // person signing in again.
  //
  // The uniqueness is what makes the lookup a *mapping* rather than a guess:
  // one subject resolves to at most one user inside a workspace, so a
  // delegated call can never land on whichever row came back first.
  await sql`
    CREATE UNIQUE INDEX auth_accounts_idp_subject_unique
      ON auth_accounts (workspace_id, idp_key, provider_user_id)
      WHERE idp_key IS NOT NULL AND deleted_at IS NULL
  `.execute(db);

  // --- 2. The organisation half --------------------------------------------
  await db.schema
    .createTable('suite_org_identity')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    // Which identity provider the organisation id belongs to. Two deployments
    // federated to different providers can hold the same numeric organisation
    // id, and without this they would resolve to each other's workspaces.
    .addColumn('idp_key', 'varchar', (col) => col.notNull())
    // The provider's own organisation identifier, stored exactly as the token
    // states it. Never derived from anything on the Hub side.
    .addColumn('external_org_id', 'varchar', (col) => col.notNull())
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    // An off switch that is not a delete: revoking delegation for an
    // organisation must not lose the record that the mapping existed, because
    // the audit rows beside it refer to it.
    .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    // One organisation names at most one workspace. Without this the resolver
    // would have to pick, and picking is how a call lands in the wrong tenant.
    .addUniqueConstraint('suite_org_identity_external_unique', [
      'idp_key',
      'external_org_id',
    ])
    .execute();

  // --- 3. The record --------------------------------------------------------
  await db.schema
    .createTable('suite_delegation_audit')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    // Both nullable, because a refusal is recorded too and a refusal often has
    // no resolved workspace or user — that is usually *why* it was refused.
    // `set null` rather than `cascade`: deleting a workspace must not erase the
    // record that somebody tried to act in it.
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('set null'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    // The canonical identifiers exactly as the assertion stated them, so a row
    // is readable even when neither side resolved. These are identifiers, not
    // credentials; the token itself is never stored, in any form. Holding it
    // would put a live bearer credential in an append-only table that outlives
    // the incident it was written for.
    .addColumn('person_uid', 'varchar')
    .addColumn('org_uid', 'varchar')
    .addColumn('issuer', 'varchar')
    .addColumn('key_id', 'varchar')
    // The assertion's own id. Enough to join this row to the issuer's audit
    // trail, and useless to anyone who captures it.
    .addColumn('jti', 'varchar')
    .addColumn('scope', 'jsonb')
    .addColumn('required_scope', 'varchar')
    .addColumn('accepted', 'boolean', (col) => col.notNull())
    // The verifier's stable classification (`delegation_expired`,
    // `identity_unmapped`, …). A free-text message would drift and could not
    // be counted.
    .addColumn('reason', 'varchar')
    .addColumn('correlation_id', 'varchar')
    .addColumn('request_method', 'varchar')
    .addColumn('request_path', 'varchar')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // "What happened in this workspace recently" — the question an operator
  // actually asks.
  await db.schema
    .createIndex('suite_delegation_audit_workspace_idx')
    .on('suite_delegation_audit')
    .columns(['workspace_id', 'created_at'])
    .execute();

  // Not unique. Replay is bounded by the assertion's short life, not by this
  // index; making it unique would refuse a second legitimate call made inside
  // one assertion's lifetime and would turn an audit write into something that
  // can fail a request.
  await db.schema
    .createIndex('suite_delegation_audit_jti_idx')
    .on('suite_delegation_audit')
    .column('jti')
    .execute();

  // Refusals are the rows worth sweeping for, and they are the minority.
  await sql`
    CREATE INDEX suite_delegation_audit_rejected_idx
      ON suite_delegation_audit (created_at)
      WHERE accepted = false
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('suite_delegation_audit_rejected_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('suite_delegation_audit_jti_idx')
    .ifExists()
    .execute();
  await db.schema
    .dropIndex('suite_delegation_audit_workspace_idx')
    .ifExists()
    .execute();
  await db.schema.dropTable('suite_delegation_audit').ifExists().execute();
  await db.schema.dropTable('suite_org_identity').ifExists().execute();
  await db.schema
    .dropIndex('auth_accounts_idp_subject_unique')
    .ifExists()
    .execute();
  await db.schema.alterTable('auth_accounts').dropColumn('idp_key').execute();
}
