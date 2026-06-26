import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { AiSourceKind } from '@docmost/db/types/embeddings.types';

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
   * Upsert a complete set of chunks for a source.  Uses the unique index on
   * (source_kind, source_id, chunk_index, model) so re-indexing the same
   * content is idempotent.
   *
   * After upsert, stale chunks (chunk_index >= newChunkCount) are deleted so
   * reducing a page never leaves orphaned embedding rows.
   */
  async upsertChunks(opts: {
    workspaceId: string;
    spaceId: string;
    sourceKind: AiSourceKind;
    sourceId: string;
    model: string;
    dim: number;
    contentHash: string;
    chunks: EmbeddingChunkInsert[];
  }): Promise<void> {
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
      await this.deleteBySource(sourceKind, sourceId);
      return;
    }

    const db = this.db as any;

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
          metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
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
        metadata: sql`jsonb_set(coalesce(metadata, '{}'::jsonb), '{spaceId}', to_jsonb(${opts.spaceId}::text), true)`,
        updatedAt: sql`now()`,
      })
      .where('sourceKind', '=', opts.sourceKind)
      .where('sourceId', '=', opts.sourceId)
      .execute();
  }

  async deleteBySource(
    sourceKind: AiSourceKind,
    sourceId: string,
  ): Promise<void> {
    await (this.db as any)
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
    const { workspaceId, queryEmbedding, spaceId, spaceIds, sourceKind, sourceId, model } =
      opts;
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
      metadata: r.metadata as Record<string, unknown> | null,
      score: Number(r.score),
    }));
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
