import { Kysely, sql } from 'kysely';

/**
 * Durable state of text extraction for page attachments (native parse or
 * OCR). The extracted text itself lives in attachments.text_content; this
 * table records how it was obtained and for which bytes, so re-indexing a
 * page never repays OCR for an unchanged file and identical files in a
 * workspace are only processed once (source_sha256).
 *
 * Additive only: no existing table or column is changed.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('attachment_text_extractions')
    .ifNotExists()
    .addColumn('attachment_id', 'uuid', (col) =>
      col.primaryKey().references('attachments.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    // extracted | partial | empty | needs_ocr | ocr_running | unsupported | too_large | failed
    .addColumn('status', 'varchar', (col) => col.notNull())
    // native | ocr | native+ocr
    .addColumn('method', 'varchar')
    .addColumn('source_sha256', 'varchar')
    .addColumn('source_size', 'int8')
    // attachments.updated_at of the bytes that were processed
    .addColumn('source_updated_at', 'timestamptz')
    .addColumn('text_sha256', 'varchar')
    .addColumn('char_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('page_count', 'integer')
    .addColumn('ocr_pages', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_error', 'text')
    // Reason / coverage code, e.g. ocr_page_limit:30/45, pages_without_text:2/12
    .addColumn('detail', 'text')
    // Owner of the current OCR claim; a result with another token is dropped.
    .addColumn('claim_token', 'uuid')
    .addColumn('extractor_version', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_attachment_text_extractions_dedup
    ON attachment_text_extractions (workspace_id, source_sha256)
    WHERE source_sha256 IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('attachment_text_extractions').ifExists().execute();
}
