import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { AiSourceKind } from '@docmost/db/types/embeddings.types';
import { KyselyTransaction } from '@docmost/db/types/kysely.types';

export interface SimilarityResult {
  sourceKind: AiSourceKind;
  sourceId: string;
  chunkIndex: number;
  chunkText: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

export interface EmbeddingChunkInsert {
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  metadata?: Record<string, unknown> | null;
}

const MAX_LEXICAL_TERMS = 24;

/**
 * ai_embeddings.metadata as a JSON object. Rows written before the
 * metadata-encoding fix hold a JSON *string* (the stringified object was
 * re-encoded by the postgres-js driver), on which `->>`, `?` and jsonb_set
 * do not work; this expression reads both shapes.
 */
export const METADATA_OBJECT = sql`(case when jsonb_typeof(metadata) = 'string' then (metadata #>> '{}')::jsonb else metadata end)`;

/** Metadata as returned to callers: always an object (or null). */
export function parseEmbeddingMetadata(
  raw: unknown,
): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

// Function words that carry no retrieval signal. The 'simple' text-search
// configuration keeps every token, so they must be removed here or a French
// or English question would be dominated by its articles and prepositions.
const LEXICAL_STOPWORDS = new Set<string>([
  // French
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'd',
  'l',
  'au',
  'aux',
  'et',
  'ou',
  'où',
  'ni',
  'ne',
  'pas',
  'plus',
  'que',
  'qui',
  'quoi',
  'quel',
  'quelle',
  'quels',
  'quelles',
  'dont',
  'est',
  'sont',
  'été',
  'être',
  'avoir',
  'a',
  'ai',
  'as',
  'ont',
  'il',
  'elle',
  'ils',
  'elles',
  'on',
  'nous',
  'vous',
  'je',
  'tu',
  'me',
  'te',
  'se',
  'moi',
  'toi',
  'lui',
  'leur',
  'leurs',
  'mon',
  'ma',
  'mes',
  'ton',
  'ta',
  'tes',
  'son',
  'sa',
  'ses',
  'notre',
  'nos',
  'votre',
  'vos',
  'ce',
  'cet',
  'cette',
  'ces',
  'ça',
  'cela',
  'ceci',
  'en',
  'y',
  'dans',
  'sur',
  'sous',
  'avec',
  'sans',
  'pour',
  'par',
  'vers',
  'chez',
  'entre',
  'comment',
  'pourquoi',
  'quand',
  'combien',
  'mais',
  'donc',
  'car',
  'si',
  'très',
  'tout',
  'tous',
  'toute',
  'toutes',
  'aussi',
  'peut',
  'peux',
  'fait',
  'faire',
  'dire',
  'dis',
  'moi',
  // English
  'the',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'with',
  'from',
  'by',
  'about',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'when',
  'where',
  'why',
  'how',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'them',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
  'me',
  'us',
  'can',
  'could',
  'should',
  'would',
  'will',
  'shall',
  'may',
  'might',
  'not',
  'no',
  'yes',
  'please',
  'tell',
  'give',
  'find',
  'show',
  'any',
  'all',
  'some',
  'there',
  'here',
]);

/**
 * Reduces a natural-language question to its distinct content words, in
 * order of appearance. Exported so the fusion layer and tests share the exact
 * tokenisation that feeds websearch_to_tsquery.
 */
export function extractLexicalTerms(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // \p{L}/\p{N} keep accented letters intact; f_unaccent folds them in SQL.
  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const term = raw.trim();
    if (term.length < 2 || LEXICAL_STOPWORDS.has(term) || seen.has(term)) {
      continue;
    }
    seen.add(term);
    out.push(term);
    if (out.length >= MAX_LEXICAL_TERMS) break;
  }
  return out;
}

@Injectable()
export class EmbeddingRepository {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Returns true when an existing row for this source already carries the
   * same content_hash, meaning nothing has changed and re-embedding can be
   * skipped entirely.
   */
  async isContentUnchanged(
    sourceKind: AiSourceKind,
    sourceId: string,
    model: string,
    newHash: string,
  ): Promise<boolean> {
    const row = await (this.db as any)
      .selectFrom('aiEmbeddings')
      .select('contentHash')
      .where('sourceKind', '=', sourceKind)
      .where('sourceId', '=', sourceId)
      .where('model', '=', model)
      .limit(1)
      .executeTakeFirst();

    return row?.contentHash === newHash;
  }

  /**
   * Vectors already stored for a source, keyed by chunk text, limited to rows
   * embedded with the same model and under the same title (the title is part
   * of the embedding input). Lets a re-index embed only the chunks that are
   * actually new.
   */
  async findReusableVectors(
    sourceKind: AiSourceKind,
    sourceId: string,
    model: string,
    title: string | null,
  ): Promise<Map<string, number[]>> {
    const rows: Array<{ chunkText: string; embedding: string | number[] }> =
      await (this.db as any)
        .selectFrom('aiEmbeddings')
        .select(['chunkText', 'embedding'])
        .where('sourceKind', '=', sourceKind)
        .where('sourceId', '=', sourceId)
        .where('model', '=', model)
        .where(
          sql`coalesce(${METADATA_OBJECT}->>'title', '')`,
          '=',
          title ?? '',
        )
        .execute();

    const out = new Map<string, number[]>();
    for (const r of rows) {
      try {
        const v = Array.isArray(r.embedding)
          ? r.embedding.map(Number)
          : (JSON.parse(r.embedding) as number[]);
        if (Array.isArray(v) && v.length > 0) out.set(r.chunkText, v);
      } catch {
        // Unparseable vector: simply re-embed that chunk.
      }
    }
    return out;
  }

  /**
   * Upsert a complete set of chunks for a source.  Uses the unique index on
   * (source_kind, source_id, chunk_index, model) so re-indexing the same
   * content is idempotent.
   *
   * After upsert, stale chunks (chunk_index >= newChunkCount) are deleted so
   * reducing a page never leaves orphaned embedding rows.
   */
  async upsertChunks(
    opts: {
      workspaceId: string;
      spaceId: string;
      sourceKind: AiSourceKind;
      sourceId: string;
      model: string;
      dim: number;
      contentHash: string;
      chunks: EmbeddingChunkInsert[];
    },
    trx?: KyselyTransaction,
  ): Promise<void> {
    const {
      workspaceId,
      spaceId,
      sourceKind,
      sourceId,
      model,
      dim,
      contentHash,
      chunks,
    } = opts;

    if (chunks.length === 0) {
      await this.deleteBySource(sourceKind, sourceId, trx);
      return;
    }

    const db = (trx ?? this.db) as any;

    for (const chunk of chunks) {
      const vectorLiteral = `[${chunk.embedding.join(',')}]`;
      await db
        .insertInto('aiEmbeddings')
        .values({
          workspaceId,
          spaceId,
          sourceKind,
          sourceId,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.chunkText,
          embedding: sql`${vectorLiteral}::vector`,
          model,
          dim,
          contentHash,
          // Sent as text and cast server-side so the column holds a JSON
          // object: a bare string parameter is re-encoded by postgres-js
          // into a JSON string scalar.
          metadata: chunk.metadata
            ? sql`${JSON.stringify(chunk.metadata)}::text::jsonb`
            : null,
          updatedAt: sql`now()`,
        })
        .onConflict((oc: any) =>
          oc
            .columns(['sourceKind', 'sourceId', 'chunkIndex', 'model'])
            .doUpdateSet({
              // Refresh space_id/workspace_id too: a page can move between
              // spaces, and the row's tenancy columns must follow it or
              // permission-scoped retrieval would use a stale space.
              workspaceId: sql`excluded.workspace_id`,
              spaceId: sql`excluded.space_id`,
              chunkText: sql`excluded.chunk_text`,
              embedding: sql`excluded.embedding`,
              contentHash: sql`excluded.content_hash`,
              metadata: sql`excluded.metadata`,
              updatedAt: sql`now()`,
            }),
        )
        .execute();
    }

    // Remove chunks that no longer exist after a page shrinks.
    await db
      .deleteFrom('aiEmbeddings')
      .where('sourceKind', '=', sourceKind)
      .where('sourceId', '=', sourceId)
      .where('model', '=', model)
      .where('chunkIndex', '>=', chunks.length)
      .execute();
  }

  /**
   * Move every embedding row for a source to a new space/workspace without
   * re-embedding. Used when a page moves spaces: the content (and vectors)
   * are unchanged, only the tenancy columns and metadata.spaceId need to
   * follow so permission-scoped retrieval stays correct.
   */
  async reassignSource(opts: {
    sourceKind: AiSourceKind;
    sourceId: string;
    workspaceId: string;
    spaceId: string;
  }): Promise<void> {
    await (this.db as any)
      .updateTable('aiEmbeddings')
      .set({
        workspaceId: opts.workspaceId,
        spaceId: opts.spaceId,
        metadata: sql`jsonb_set(coalesce(${METADATA_OBJECT}, '{}'::jsonb), '{spaceId}', to_jsonb(${opts.spaceId}::text), true)`,
        updatedAt: sql`now()`,
      })
      .where('sourceKind', '=', opts.sourceKind)
      .where('sourceId', '=', opts.sourceId)
      .execute();
  }

  async deleteBySource(
    sourceKind: AiSourceKind,
    sourceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await ((trx ?? this.db) as any)
      .deleteFrom('aiEmbeddings')
      .where('sourceKind', '=', sourceKind)
      .where('sourceId', '=', sourceId)
      .execute();
  }

  async deleteBySourceIds(
    sourceKind: AiSourceKind,
    sourceIds: string[],
  ): Promise<void> {
    if (sourceIds.length === 0) return;
    await (this.db as any)
      .deleteFrom('aiEmbeddings')
      .where('sourceKind', '=', sourceKind)
      .where('sourceId', 'in', sourceIds)
      .execute();
  }

  async deleteByWorkspace(workspaceId: string): Promise<void> {
    await (this.db as any)
      .deleteFrom('aiEmbeddings')
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async deleteBySpace(spaceId: string): Promise<void> {
    await (this.db as any)
      .deleteFrom('aiEmbeddings')
      .where('spaceId', '=', spaceId)
      .execute();
  }

  /**
   * Cosine similarity search using pgvector's <=> operator.
   * Returns top-K chunks ordered from most to least relevant (score: 0–1).
   *
   * `spaceIds` constrains the search to a set of spaces — pass the caller's
   * readable spaces to keep retrieval inside the user's permission boundary.
   * An empty array matches nothing (a user who can read no space gets no
   * results), which is the safe default rather than a workspace-wide search.
   */
  async similaritySearch(opts: {
    workspaceId: string;
    queryEmbedding: number[];
    spaceId?: string;
    spaceIds?: string[];
    sourceKind?: AiSourceKind;
    sourceId?: string;
    model?: string;
    topK?: number;
  }): Promise<SimilarityResult[]> {
    const {
      workspaceId,
      queryEmbedding,
      spaceId,
      spaceIds,
      sourceKind,
      sourceId,
      model,
    } = opts;
    const topK = opts.topK ?? 8;

    // An explicit empty allow-list means "no readable spaces" — return early
    // rather than emit `IN ()`, which different drivers handle inconsistently.
    if (spaceIds && spaceIds.length === 0) return [];

    // Bind the query vector as a parameter (text -> ::vector cast), matching
    // the upsert path. Avoids sql.raw string interpolation entirely.
    const vectorLiteral = `[${queryEmbedding.join(',')}]`;
    const queryVector = sql`${vectorLiteral}::vector`;

    const rows: Array<{
      sourceKind: string;
      sourceId: string;
      chunkIndex: number;
      chunkText: string;
      metadata: unknown;
      score: number;
    }> = await (this.db as any)
      .selectFrom('aiEmbeddings')
      .select([
        'sourceKind',
        'sourceId',
        'chunkIndex',
        'chunkText',
        'metadata',
        sql`1 - (embedding <=> ${queryVector})`.as('score'),
      ])
      .where('workspaceId', '=', workspaceId)
      .$if(!!spaceId, (qb: any) => qb.where('spaceId', '=', spaceId))
      .$if(!!spaceIds, (qb: any) => qb.where('spaceId', 'in', spaceIds))
      .$if(!!sourceKind, (qb: any) => qb.where('sourceKind', '=', sourceKind))
      .$if(!!sourceId, (qb: any) => qb.where('sourceId', '=', sourceId))
      .$if(!!model, (qb: any) => qb.where('model', '=', model))
      .orderBy(sql`embedding <=> ${queryVector}`, 'asc')
      .limit(topK)
      .execute();

    return rows.map((r) => ({
      sourceKind: r.sourceKind as AiSourceKind,
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      chunkText: r.chunkText,
      metadata: parseEmbeddingMetadata(r.metadata),
      score: Number(r.score),
    }));
  }

  /**
   * Lexical (full-text) search over the generated `tsv` column, the exact-term
   * complement to `similaritySearch`. Proper nouns, client names and acronyms
   * that embeddings place poorly are found here by accent-insensitive token
   * match ('simple' config + f_unaccent, so French and English behave alike).
   *
   * The question is reduced to its content words and OR-ed, because the
   * 'simple' configuration has no stop-word list and AND-ing every word of a
   * natural-language question would almost never match. `ts_rank_cd` still
   * ranks chunks that match more of the terms higher. Same permission filters
   * as `similaritySearch`: an empty `spaceIds` allow-list matches nothing.
   *
   * Requires migration 20261013T120000-ai-embeddings-lexical; callers treat a
   * failure here as "no lexical results" so retrieval degrades to vector-only.
   */
  async lexicalSearch(opts: {
    workspaceId: string;
    query: string;
    spaceId?: string;
    spaceIds?: string[];
    sourceKind?: AiSourceKind;
    sourceId?: string;
    model?: string;
    topK?: number;
  }): Promise<SimilarityResult[]> {
    if (opts.spaceIds && opts.spaceIds.length === 0) return [];

    const qb = this.buildLexicalQuery(opts);
    if (!qb) return [];

    const rows: Array<{
      sourceKind: string;
      sourceId: string;
      chunkIndex: number;
      chunkText: string;
      metadata: unknown;
      score: number;
    }> = await qb.execute();

    return rows.map((r) => ({
      sourceKind: r.sourceKind as AiSourceKind,
      sourceId: r.sourceId,
      chunkIndex: r.chunkIndex,
      chunkText: r.chunkText,
      metadata: parseEmbeddingMetadata(r.metadata),
      score: Number(r.score),
    }));
  }

  /**
   * Builds (without executing) the lexical query so its SQL shape can be
   * compiled and inspected in tests. Returns null when the question carries no
   * searchable term, in which case no query should run at all.
   */
  buildLexicalQuery(opts: {
    workspaceId: string;
    query: string;
    spaceId?: string;
    spaceIds?: string[];
    sourceKind?: AiSourceKind;
    sourceId?: string;
    model?: string;
    topK?: number;
  }): any | null {
    const { workspaceId, spaceId, spaceIds, sourceKind, sourceId, model } =
      opts;
    const topK = opts.topK ?? 8;

    const terms = extractLexicalTerms(opts.query);
    if (terms.length === 0) return null;

    // websearch_to_tsquery never raises on user input (unlike to_tsquery) and
    // understands the `or` keyword, which is how the terms are combined.
    const websearch = terms.join(' or ');
    const tsquery = sql`websearch_to_tsquery('simple', f_unaccent(${websearch}))`;

    return (this.db as any)
      .selectFrom('aiEmbeddings')
      .select([
        'sourceKind',
        'sourceId',
        'chunkIndex',
        'chunkText',
        'metadata',
        sql`ts_rank_cd(tsv, ${tsquery})`.as('score'),
      ])
      .where('workspaceId', '=', workspaceId)
      .$if(!!spaceId, (qb: any) => qb.where('spaceId', '=', spaceId))
      .$if(!!spaceIds, (qb: any) => qb.where('spaceId', 'in', spaceIds))
      .$if(!!sourceKind, (qb: any) => qb.where('sourceKind', '=', sourceKind))
      .$if(!!sourceId, (qb: any) => qb.where('sourceId', '=', sourceId))
      .$if(!!model, (qb: any) => qb.where('model', '=', model))
      .where(sql`tsv @@ ${tsquery}`)
      .orderBy(sql`ts_rank_cd(tsv, ${tsquery})`, 'desc')
      .limit(topK);
  }

  /**
   * Count indexed pages for a workspace (used by backfill to report skips).
   */
  async countByWorkspace(workspaceId: string): Promise<number> {
    const row = await (this.db as any)
      .selectFrom('aiEmbeddings')
      .select((eb: any) => eb.fn.countAll().as('n'))
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
    return Number(row?.n ?? 0);
  }
}
