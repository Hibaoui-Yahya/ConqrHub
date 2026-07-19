import { type Kysely, sql } from 'kysely';

/**
 * Adds retry/dead-letter bookkeeping to the webhook inbox (blueprint §8.4, §10):
 * `attempts` counts processing tries so poison deliveries can be moved to a
 * dead-letter status and replayed by an administrator.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('integration_webhook_deliveries')
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    // Minimal parsed metadata (a URN + action string — no sensitive body) so a
    // dead-lettered delivery can be self-replayed without re-storing the payload.
    .addColumn('subject', 'varchar')
    .addColumn('action', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('integration_webhook_deliveries')
    .dropColumn('attempts')
    .dropColumn('subject')
    .dropColumn('action')
    .execute();
}
