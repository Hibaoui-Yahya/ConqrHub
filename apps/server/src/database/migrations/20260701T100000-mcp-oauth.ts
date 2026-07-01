import { Kysely, sql } from 'kysely';

/**
 * MCP OAuth 2.1 authorization-server tables.
 *
 * The durable "grant" for an OAuth-connected MCP client is an ordinary
 * api_keys row (so the existing JwtStrategy API_KEY validation path applies
 * unchanged and the grant is revocable from the API Keys UI). These two
 * columns let that row be recognised as OAuth-issued and tie it to the
 * dynamically-registered client. Auth codes live in Redis (short-lived);
 * refresh tokens are stored here as hashes.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // --- api_keys: mark OAuth-issued grants ------------------------------------
  await db.schema
    .alterTable('api_keys')
    .addColumn('type', 'text', (col) => col.notNull().defaultTo('default'))
    .execute();

  await db.schema
    .alterTable('api_keys')
    .addColumn('client_id', 'text')
    .execute();

  // --- mcp_oauth_clients: dynamically-registered (RFC 7591) public clients ---
  await db.schema
    .createTable('mcp_oauth_clients')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('client_id', 'text', (col) => col.notNull().unique())
    .addColumn('client_name', 'text')
    .addColumn('redirect_uris', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('grant_types', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'["authorization_code","refresh_token"]'::jsonb`),
    )
    .addColumn('response_types', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'["code"]'::jsonb`),
    )
    .addColumn('token_endpoint_auth_method', 'text', (col) =>
      col.notNull().defaultTo('none'),
    )
    .addColumn('scope', 'text')
    // Workspace the registration was performed under (host-resolved). Nullable
    // — kept for auditing; security rests on redirect_uri + PKCE + consent.
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  // --- mcp_oauth_refresh_tokens: rotating refresh tokens ---------------------
  await db.schema
    .createTable('mcp_oauth_refresh_tokens')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    // sha-256 hex of the opaque refresh token; the raw token is never stored.
    .addColumn('token_hash', 'text', (col) => col.notNull().unique())
    .addColumn('client_id', 'text', (col) => col.notNull())
    // The durable grant (api_keys row). Cascade so revoking the grant kills
    // every refresh token minted from it.
    .addColumn('api_key_id', 'uuid', (col) =>
      col.notNull().references('api_keys.id').onDelete('cascade'),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('scope', 'text')
    // Canonical resource (token audience) this grant is bound to.
    .addColumn('resource', 'text')
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    // Set when the token has been used and rotated out. A non-null rotated_at
    // that is presented again signals refresh-token reuse -> revoke the chain.
    .addColumn('rotated_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('mcp_oauth_refresh_tokens_api_key_idx')
    .ifNotExists()
    .on('mcp_oauth_refresh_tokens')
    .column('api_key_id')
    .execute();

  await db.schema
    .createIndex('mcp_oauth_refresh_tokens_user_idx')
    .ifNotExists()
    .on('mcp_oauth_refresh_tokens')
    .column('user_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('mcp_oauth_refresh_tokens').ifExists().execute();
  await db.schema.dropTable('mcp_oauth_clients').ifExists().execute();
  await db.schema.alterTable('api_keys').dropColumn('client_id').execute();
  await db.schema.alterTable('api_keys').dropColumn('type').execute();
}
