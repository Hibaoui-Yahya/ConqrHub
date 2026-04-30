import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingRepository } from './embedding.repository';

export interface IndexInsightResult {
  insightId: string;
  status: 'indexed' | 'skipped' | 'deleted' | 'no_content' | 'ai_unavailable';
  chunksIndexed?: number;
}

@Injectable()
export class InsightIndexerService {
  private readonly logger = new Logger(InsightIndexerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly aiProvider: AiProviderService,
    private readonly env: EnvironmentService,
    private readonly chunking: ChunkingService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async indexInsight(
    insightId: string,
    workspaceId: string,
    spaceId: string,
  ): Promise<IndexInsightResult> {
    if (!this.aiProvider.isAvailable()) {
      return { insightId, status: 'ai_unavailable' };
    }

    const insight = await (this.db as any)
      .selectFrom('expertInsights')
      .select(['id', 'title', 'body', 'status', 'deletedAt'])
      .where('id', '=', insightId)
      .executeTakeFirst();

    if (!insight || insight.deletedAt) {
      await this.repo.deleteBySource('expert_insight', insightId);
      return { insightId, status: 'deleted' };
    }

    const text = [insight.title, insight.body].filter(Boolean).join(' ');
    if (!text.trim()) {
      await this.repo.deleteBySource('expert_insight', insightId);
      return { insightId, status: 'no_content' };
    }

    const model = this.env.getAiEmbeddingModel() || 'mistral-embed';
    const dim = this.aiProvider.getEmbeddingDimension();
    const contentHash = this.chunking.contentHash(text);

    const unchanged = await this.repo.isContentUnchanged(
      'expert_insight',
      insightId,
      model,
      contentHash,
    );
    if (unchanged) {
      return { insightId, status: 'skipped' };
    }

    const chunkChars = this.env.getAiEmbeddingChunkChars();
    const overlap = this.env.getAiEmbeddingChunkOverlap();
    const batchSize = this.env.getAiEmbeddingBatchSize();

    const chunks = this.chunking.chunk(text, { chunkChars, overlap });
    if (chunks.length === 0) {
      await this.repo.deleteBySource('expert_insight', insightId);
      return { insightId, status: 'no_content' };
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
        insightId,
        title: insight.title ?? null,
        spaceId,
        workspaceId,
      },
    }));

    await this.repo.upsertChunks({
      workspaceId,
      spaceId,
      sourceKind: 'expert_insight',
      sourceId: insightId,
      model,
      dim,
      contentHash,
      chunks: embeddingChunks,
    });

    this.logger.debug(
      `Indexed insight ${insightId}: ${chunks.length} chunks (model=${model})`,
    );

    return { insightId, status: 'indexed', chunksIndexed: chunks.length };
  }

  async deleteInsightEmbeddings(insightId: string): Promise<void> {
    await this.repo.deleteBySource('expert_insight', insightId);
  }
}
