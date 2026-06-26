import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingRepository } from './embedding.repository';

export interface IndexPageResult {
  pageId: string;
  status: 'indexed' | 'skipped' | 'deleted' | 'no_content' | 'ai_unavailable';
  chunksIndexed?: number;
}

@Injectable()
export class EmbeddingIndexerService {
  private readonly logger = new Logger(EmbeddingIndexerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiProvider: AiProviderService,
    private readonly env: EnvironmentService,
    private readonly chunking: ChunkingService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async indexPage(
    pageId: string,
    workspaceId: string,
  ): Promise<IndexPageResult> {
    if (!this.aiProvider.isAvailable()) {
      return { pageId, status: 'ai_unavailable' };
    }

    const page = await (this.db as any)
      .selectFrom('pages')
      .select(['id', 'title', 'textContent', 'spaceId', 'deletedAt'])
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    if (!page) {
      this.logger.warn(`indexPage: page ${pageId} not found in ${workspaceId}`);
      return { pageId, status: 'deleted' };
    }

    if (page.deletedAt) {
      await this.repo.deleteBySource('page', pageId);
      return { pageId, status: 'deleted' };
    }

    if (!page.textContent?.trim()) {
      await this.repo.deleteBySource('page', pageId);
      return { pageId, status: 'no_content' };
    }

    const model =
      this.env.getAiEmbeddingModel() || 'mistral-embed';
    const dim = this.aiProvider.getEmbeddingDimension();
    const contentHash = this.chunking.contentHash(page.textContent);

    const unchanged = await this.repo.isContentUnchanged(
      'page',
      pageId,
      model,
      contentHash,
    );
    if (unchanged) {
      return { pageId, status: 'skipped' };
    }

    const chunkChars = this.env.getAiEmbeddingChunkChars();
    const overlap = this.env.getAiEmbeddingChunkOverlap();
    const batchSize = this.env.getAiEmbeddingBatchSize();

    const chunks = this.chunking.chunk(page.textContent, {
      chunkChars,
      overlap,
    });

    if (chunks.length === 0) {
      await this.repo.deleteBySource('page', pageId);
      return { pageId, status: 'no_content' };
    }

    const texts = chunks.map((c) => c.chunkText);
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const vectors = await this.aiProvider.embedMany(batch);
      allEmbeddings.push(...vectors);
    }

    const embeddingChunks = chunks.map((c, i) => ({
      chunkIndex: c.chunkIndex,
      chunkText: c.chunkText,
      embedding: allEmbeddings[i],
      metadata: {
        pageId,
        title: page.title ?? null,
        spaceId: page.spaceId,
        workspaceId,
      },
    }));

    await this.repo.upsertChunks({
      workspaceId,
      spaceId: page.spaceId,
      sourceKind: 'page',
      sourceId: pageId,
      model,
      dim,
      contentHash,
      chunks: embeddingChunks,
    });

    this.logger.debug(
      `Indexed page ${pageId}: ${chunks.length} chunks (model=${model})`,
    );

    return { pageId, status: 'indexed', chunksIndexed: chunks.length };
  }

  /**
   * Refresh the space/workspace of a page's existing embeddings after it
   * moves spaces. Content is unchanged, so this avoids re-embedding and just
   * updates the tenancy columns from the page's current row. If the page is
   * gone or soft-deleted, its embeddings are removed instead.
   */
  async reassignPageSpace(
    pageId: string,
    workspaceId: string,
  ): Promise<void> {
    const page = await (this.db as any)
      .selectFrom('pages')
      .select(['spaceId', 'deletedAt'])
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    if (!page || page.deletedAt) {
      await this.repo.deleteBySource('page', pageId);
      return;
    }

    await this.repo.reassignSource({
      sourceKind: 'page',
      sourceId: pageId,
      workspaceId,
      spaceId: page.spaceId,
    });
  }

  async deletePageEmbeddings(pageId: string): Promise<void> {
    await this.repo.deleteBySource('page', pageId);
  }

  async deletePageEmbeddingsBatch(pageIds: string[]): Promise<void> {
    await this.repo.deleteBySourceIds('page', pageIds);
  }
}
