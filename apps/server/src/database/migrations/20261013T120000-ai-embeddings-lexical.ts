import { Kysely, sql } from 'kysely';

/**
 * Lexical (full-text) companion to the vector index on ai_embeddings.
 *
 * `tsv` is a generated column built with the 'simple' configuration (no
 * language stemming, so French and English chunks are treated alike) over
 * f_unaccent(chunk_text) — the IMMUTABLE unaccent wrapper created by
 * 20250729T213756-add-unaccent-pg_trm-update-tsvector. Accent-insensitive
 * exact-term matching is what makes proper nouns, client names and acronyms
 * retrievable when cosine similarity alone ranks them poorly.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE ai_embeddings
    ADD COLUMN IF NOT EXISTS tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent(chunk_text))) STORED
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ai_embeddings_tsv
    ON ai_embeddings
    USING gin (tsv)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_ai_embeddings_tsv`.execute(db);
  await sql`ALTER TABLE ai_embeddings DROP COLUMN IF EXISTS tsv`.execute(db);
}
