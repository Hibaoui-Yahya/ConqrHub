import { Kysely } from 'kysely';

/**
 * Scaffold for the v2 doc-health AI-confidence + search-success signals.
 *
 * Both columns are NULLABLE and have no default. They stay null until the
 * AI Search code path (which today does not record confidence or grounding
 * info) is updated to populate them. Doc-health's ScoringService treats
 * null as "not applicable" so the signals are inert until then — and we
 * can land this migration ahead of the AI Search work without affecting
 * any existing score.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('ai_chat_messages')
    .addColumn('confidence', 'real')
    .execute();

  await db.schema
    .alterTable('ai_chat_messages')
    .addColumn('grounded_source_count', 'integer')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('ai_chat_messages')
    .dropColumn('grounded_source_count')
    .execute();

  await db.schema
    .alterTable('ai_chat_messages')
    .dropColumn('confidence')
    .execute();
}
