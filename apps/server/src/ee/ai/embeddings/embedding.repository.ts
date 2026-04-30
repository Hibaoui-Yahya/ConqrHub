import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { AiSourceKind } from '@docmost/db/types/embeddings.types';

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
