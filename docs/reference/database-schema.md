# Database Schema Reference

PostgreSQL schema for ConqrAI Wiki. The authoritative schema is **the migrations** in `apps/server/src/database/migrations/` and the codegen output in `apps/server/src/database/types/db.d.ts`.

This page summarizes the most important tables. For exact column types, run `pnpm migration:codegen` and inspect the generated types.

## Conventions

- Most tables have `id UUID PK`, `created_at`, `updated_at`, and where appropriate `deleted_at` for soft delete.
- Foreign keys are explicit (`workspace_id`, `space_id`, `page_id`, `user_id`).
- Multi-tenancy is row-level: every domain row has `workspace_id`, every per-space row has `space_id`.
- Full-text search uses `tsvector` columns with GIN indexes (`unaccent` extension required).

## Core tables (Free)

### `workspaces`
Top-level tenant container.
- `id`, `name`, `slug`, `logo`, `default_role`, `enforce_sso`, `enforce_mfa`
- `settings JSONB` — `{ ai: {generative,search,chat,mcp}, sharing: {disabled} }`
- `license_key` (self-hosted), `plan_id` (cloud)

### `users`
- `id`, `email`, `name`, `avatar_url`, `password_hash`, `is_active`
- `mfa_enabled`, `mfa_secret`, `mfa_backup_codes` (Business+)
- `last_login_at`

### `spaces`
- `id`, `workspace_id`, `name`, `slug`, `icon`, `description`, `visibility`
- `default_role`, `settings JSONB`

### `space_members`
- `space_id`, `user_id`, `role` (admin / writer / reader)

### `groups`
- `id`, `workspace_id`, `name`, `description`, `is_synced` (SCIM)

### `group_members`
- `group_id`, `user_id`

### `space_groups`
- `space_id`, `group_id`, `role`

### `pages`
- `id`, `slug_id` (URL fragment), `workspace_id`, `space_id`, `parent_page_id`
- `title`, `icon`, `cover_image_url`
- `content JSONB` — ProseMirror JSON
- `ydoc BYTEA` — Yjs binary state (authoritative)
- `text_content TEXT` — plain text materialized for search
- `tsv TSVECTOR` — full-text index (GIN)
- `creator_id`, `last_updated_by_id`, `owner_id`
- `status` — see [`./status-codes.md`](./status-codes.md)
- `created_at`, `updated_at`, `deleted_at`

### `page_history`
- `id`, `page_id`, `workspace_id`, `version`
- `content JSONB`, `ydoc BYTEA`
- `created_by_id`, `created_at`

### `comments`
- `id`, `page_id`, `parent_comment_id`, `creator_id`
- `content JSONB`, `tsv TSVECTOR`
- `is_resolved BOOLEAN` (Business+ feature)
- `created_at`, `updated_at`, `deleted_at`

### `attachments`
- `id`, `page_id`, `workspace_id`
- `file_name`, `mime_type`, `size`, `storage_path`
- `text_content` (when `Feature.ATTACHMENT_INDEXING`)

### `shares`
- `id`, `page_id` (or `space_id`), `workspace_id`
- `token` (URL component), `password_hash`, `expires_at`
- `allow_indexing`, `remove_branding`

### `workspace_invitations`
- `id`, `workspace_id`, `email`, `role`
- `token VARCHAR(16)` — nanoid
- `group_ids UUID[]`
- `invited_by_id`, `created_at`
- UNIQUE(`email`, `workspace_id`)

### `notifications`
- `id`, `user_id`, `type`, `payload JSONB`
- `read_at`, `created_at`

### `favorites`
- `user_id`, `page_id`

### `watchers`
- `user_id`, `page_id` (or `space_id`)

### `sessions`
- `id`, `user_id`, `created_at`, `last_active_at`, `ip_address`, `user_agent`

## Enterprise tables

### `api_keys` — `Feature.API_KEYS` (Business+)
- `id`, `name`, `creator_id`, `workspace_id`
- `expires_at`, `last_used_at`
- `created_at`, `updated_at`, `deleted_at`

### `templates` — `Feature.TEMPLATES` (Business+)
- `id`, `title`, `description`, `icon`
- `content JSONB` — ProseMirror JSON
- `ydoc BYTEA`
- `text_content TEXT`, `tsv TSVECTOR`
- `space_id` (nullable — null = workspace-level), `workspace_id`
- `creator_id`, `last_updated_by_id`
- `collaborator_ids UUID[]`

### `page_access` — `Feature.PAGE_PERMISSIONS` (Enterprise)
- `id`, `page_id`, `workspace_id`
- `inherits_from` (FK to parent `page_access`)
- `created_by_id`, `created_at`

### `page_permissions`
- `id`, `page_access_id`
- `user_id` (nullable), `group_id` (nullable)
- `role` — `'reader' | 'writer'`

### `page_verifications` — `Feature.PAGE_VERIFICATION` (Enterprise)
- `id`, `page_id` (UNIQUE), `workspace_id`, `space_id`
- `type` — `'expiring' | 'qms'`
- `mode` — `'period' | 'fixed' | 'indefinite'`
- `period_amount INT`, `period_unit VARCHAR` (`day | week | month | year`)
- `status` — see [`./status-codes.md`](./status-codes.md)
- `verified_at`, `verified_by_id`
- `expires_at`
- `requested_at`, `requested_by_id`
- `rejected_at`, `rejected_by_id`, `rejection_comment`
- `data JSONB`

### `page_verifiers`
- `id`, `page_verification_id`, `user_id`
- `is_primary BOOLEAN`, `added_by_id`

### `audit_logs` — `Feature.AUDIT_LOGS` (Enterprise)
- `id`, `workspace_id`
- `actor_id`, `actor_type` (`user | system | api_key`)
- `event VARCHAR`, `resource_type VARCHAR`, `resource_id UUID`
- `space_id`, `changes JSONB`, `metadata JSONB`
- `ip_address`, `created_at`

### `auth_providers` — SSO (Business+)
- `id`, `workspace_id`, `name`, `type` (`google | saml | oidc | ldap`)
- SAML: `saml_url`, `saml_certificate`
- OIDC: `oidc_issuer`, `oidc_client_id`, `oidc_client_secret`
- LDAP: `ldap_url`, `ldap_bind_dn`, `ldap_bind_password`, `ldap_base_dn`, `ldap_user_search_filter`, `ldap_user_attributes`, `ldap_tls_enabled`, `ldap_tls_ca_cert`
- `allow_signup`, `is_enabled`, `group_sync`, `provider_id`

### AI tables (Enterprise)

#### `ai_chats`
- `id`, `workspace_id`, `creator_id`, `title`, `created_at`, `updated_at`

#### `ai_chat_messages`
- `id`, `chat_id`, `role` (`user | assistant | tool`), `content TEXT`
- `tool_calls JSONB`, `metadata JSONB`, `created_at`

#### `ai_embeddings` (vector store for AI Search)
- `id`, `page_id`, `chunk_index`, `text_chunk`
- `embedding VECTOR(<dim>)` — actual column type depends on the configured embedding provider

### `file_tasks` — long-running file workflows
- `id`, `workspace_id`, `creator_id`
- `type` (e.g. `import_confluence`, `import_notion`)
- `status`, `progress`, `error`, `payload JSONB`
- `created_at`, `updated_at`

## Index hints

- All `tsv` columns: GIN index for full-text search.
- All `*_id` foreign keys: B-tree index.
- `pages.space_id, parent_page_id` composite for tree queries.
- `notifications.user_id, read_at` for unread queries.
- `audit_logs.workspace_id, created_at` for filtered audit list.
- `pages.deleted_at` (partial / `WHERE deleted_at IS NULL`) for fast non-trash listing.

## Migrations

- **Location:** `apps/server/src/database/migrations/`
- **Naming:** `YYYYMMDDTHHMMSS-name.ts`
- **Total at writing:** 44
- **Most recent:**
  1. `20260414T124451-update-file_tasks.ts`
  2. `20260413T121647-page-verifications.ts`
  3. `20260412T162318-favorites.ts`
  4. `20260412T135891-templates.ts`
  5. `20260409T132415-ai-chat.ts`

After making schema changes, regenerate types: `pnpm migration:codegen`.

For migration commands and the daily workflow, see [`../engineering/database-and-migrations.md`](../engineering/database-and-migrations.md).
