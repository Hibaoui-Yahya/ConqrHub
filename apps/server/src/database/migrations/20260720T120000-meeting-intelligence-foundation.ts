import { Kysely, sql } from 'kysely';

/**
 * Meeting Intelligence foundation (see CONQR_MEETING_DATA_MODEL.md):
 * - extends meeting_status with the processing-pipeline states
 * - extends meetings with capture/consent/type/storage/retention/cost columns
 * - adds meeting_transcripts (versioned, two-pass), meeting_documents,
 *   meeting_action_proposals, meeting_processing_events, meeting_templates
 */
export async function up(db: Kysely<any>): Promise<void> {
  const newStatuses = [
    'created',
    'uploading',
    'uploaded',
    'normalizing_audio',
    'batch_submitted',
    'batch_processing',
    'transcribed',
    'speakers_pending_review',
    'analyzing',
    'documents_generating',
    'proposals_generating',
    'awaiting_review',
    'published',
    'partially_failed',
    'archived',
    'deletion_pending',
    'deleted',
  ];
  for (const value of newStatuses) {
    await sql`ALTER TYPE meeting_status ADD VALUE IF NOT EXISTS ${sql.raw(`'${value}'`)}`.execute(
      db,
    );
  }

  await db.schema
    .alterTable('meetings')
    .addColumn('capture_kind', 'text', (col) => col.notNull().defaultTo('live'))
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('set null'),
    )
    .addColumn('meeting_type', 'text', (col) =>
      col.notNull().defaultTo('generic-meeting'),
    )
    .addColumn('meeting_type_source', 'text', (col) =>
      col.notNull().defaultTo('default'),
    )
    .addColumn('meeting_type_confidence', 'real')
    .addColumn('language_config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('consent_confirmed_at', 'timestamptz')
    .addColumn('consent_confirmed_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('audio_storage_prefix', 'text')
    .addColumn('audio_manifest', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('legal_hold', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('retention_until', 'timestamptz')
    .addColumn('cost', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('published_at', 'timestamptz')
    .addColumn('archived_at', 'timestamptz')
    .addColumn('failure_reason', 'text')
    .execute();

  await db.schema
    .createTable('meeting_transcripts')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('version', 'integer', (col) => col.notNull())
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('processing'))
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('provider_job_id', 'text')
    .addColumn('webhook_token_hash', 'text')
    .addColumn('language', 'text')
    .addColumn('detected_languages', 'jsonb')
    .addColumn('processing_config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('segments', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn('speakers', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('raw_payload_path', 'text')
    .addColumn('is_provisional', 'boolean', (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn('edited_from_version', 'integer')
    .addColumn('error', 'text')
    .addColumn('created_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('meeting_transcripts_meeting_version_uidx')
    .ifNotExists()
    .unique()
    .on('meeting_transcripts')
    .columns(['meeting_id', 'version'])
    .execute();

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS meeting_transcripts_provider_job_uidx
    ON meeting_transcripts (provider_job_id) WHERE provider_job_id IS NOT NULL
  `.execute(db);

  await db.schema
    .createTable('meeting_documents')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('transcript_version', 'integer', (col) => col.notNull())
    .addColumn('template_id', 'text', (col) => col.notNull())
    .addColumn('template_version', 'integer', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('content_markdown', 'text', (col) => col.notNull())
    .addColumn('structured', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('generated'))
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('meeting_documents_meeting_idx')
    .ifNotExists()
    .on('meeting_documents')
    .columns(['meeting_id', 'created_at'])
    .execute();

  await db.schema
    .createTable('meeting_action_proposals')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('transcript_version', 'integer', (col) => col.notNull())
    .addColumn('document_id', 'uuid', (col) =>
      col.references('meeting_documents.id').onDelete('set null'),
    )
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('target_app', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('evidence', 'jsonb', (col) => col.notNull())
    .addColumn('confidence', 'real', (col) => col.notNull())
    .addColumn('commitment', 'text', (col) =>
      col.notNull().defaultTo('suggested'),
    )
    .addColumn('risk_level', 'text', (col) => col.notNull().defaultTo('normal'))
    .addColumn('validation', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('duplicate_check', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('proposed'))
    .addColumn('decided_by', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('decided_at', 'timestamptz')
    .addColumn('edited_payload', 'jsonb')
    .addColumn('execution_result', 'jsonb')
    .addColumn('idempotency_key', 'text', (col) => col.notNull().unique())
    .addColumn('automation_rule_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('meeting_action_proposals_meeting_idx')
    .ifNotExists()
    .on('meeting_action_proposals')
    .columns(['meeting_id', 'status'])
    .execute();

  await db.schema
    .createTable('meeting_processing_events')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('meeting_id', 'uuid', (col) =>
      col.notNull().references('meetings.id').onDelete('cascade'),
    )
    .addColumn('event', 'text', (col) => col.notNull())
    .addColumn('from_status', 'text')
    .addColumn('to_status', 'text')
    .addColumn('detail', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('actor_id', 'uuid')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('meeting_processing_events_meeting_idx')
    .ifNotExists()
    .on('meeting_processing_events')
    .columns(['meeting_id', 'created_at'])
    .execute();

  await db.schema
    .createTable('meeting_templates')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('meeting_type', 'text', (col) => col.notNull())
    .addColumn('level', 'text', (col) => col.notNull().defaultTo('organization'))
    .addColumn('owner_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade'),
    )
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('definition', 'jsonb', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS meeting_templates_slot_uidx
    ON meeting_templates (workspace_id, meeting_type, level, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('meeting_templates').ifExists().execute();
  await db.schema.dropTable('meeting_processing_events').ifExists().execute();
  await db.schema.dropTable('meeting_action_proposals').ifExists().execute();
  await db.schema.dropTable('meeting_documents').ifExists().execute();
  await db.schema.dropTable('meeting_transcripts').ifExists().execute();

  await db.schema
    .alterTable('meetings')
    .dropColumn('capture_kind')
    .dropColumn('space_id')
    .dropColumn('meeting_type')
    .dropColumn('meeting_type_source')
    .dropColumn('meeting_type_confidence')
    .dropColumn('language_config')
    .dropColumn('consent_confirmed_at')
    .dropColumn('consent_confirmed_by')
    .dropColumn('audio_storage_prefix')
    .dropColumn('audio_manifest')
    .dropColumn('legal_hold')
    .dropColumn('retention_until')
    .dropColumn('cost')
    .dropColumn('published_at')
    .dropColumn('archived_at')
    .dropColumn('failure_reason')
    .execute();
  // Postgres cannot remove enum values; the added meeting_status values remain.
}
