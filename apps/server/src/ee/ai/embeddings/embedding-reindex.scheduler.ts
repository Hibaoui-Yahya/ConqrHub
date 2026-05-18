import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';

/**
 * Periodically re-indexes content whose embeddings may be stale:
 * - pages updated since their last embedding
 * - insights updated since their last embedding
 *
 * Runs daily at 3 AM UTC to minimize impact.
 */
@Injectable()
export class EmbeddingReindexScheduler {
  private readonly logger = new Logger(EmbeddingReindexScheduler.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  @Cron('0 3 * * *')
  async reindexStalePages() {
    try {
      // Find pages that were updated after their last embedding
      const stalePages: { id: string }[] = await (this.db as any)
        .selectFrom('pages as p')
        .innerJoin('aiEmbeddings as e', (join) =>
          join
            .onRef('e.sourceId', '=', 'p.id')
            .on('e.sourceKind', '=', 'page'),
        )
        .select(['p.id'])
        .where('p.updatedAt', '>', (eb: any) =>
          eb.selectFrom('aiEmbeddings')
            .select((eb2: any) => eb2.fn.max('updatedAt'))
            .whereRef('sourceId', '=', 'p.id')
            .where('sourceKind', '=', 'page'),
        )
        .where('p.deletedAt', 'is', null)
        .groupBy('p.id')
        .limit(500)
        .execute();

      if (stalePages.length > 0) {
        const batch = stalePages.map((p) => p.id);
        await this.aiQueue.add(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
          pageIds: batch,
          workspaceId: null,
        });
        this.logger.log(`Re-indexed ${stalePages.length} stale pages`);
      }
    } catch (err) {
      this.logger.warn(`Stale page re-index failed: ${(err as Error).message}`);
    }
  }

  @Cron('30 3 * * *')
  async reindexStaleInsights() {
    try {
      const staleInsights: { id: string }[] = await (this.db as any)
        .selectFrom('expertInsights as i')
        .innerJoin('aiEmbeddings as e', (join) =>
          join
            .onRef('e.sourceId', '=', 'i.id')
            .on('e.sourceKind', '=', 'expert_insight'),
        )
        .select(['i.id'])
        .where('i.updatedAt', '>', (eb: any) =>
          eb.selectFrom('aiEmbeddings')
            .select((eb2: any) => eb2.fn.max('updatedAt'))
            .whereRef('sourceId', '=', 'i.id')
            .where('sourceKind', '=', 'expert_insight'),
        )
        .where('i.deletedAt', 'is', null)
        .groupBy('i.id')
        .limit(500)
        .execute();

      if (staleInsights.length > 0) {
        const batch = staleInsights.map((i) => i.id);
        await this.aiQueue.add(QueueJob.GENERATE_INSIGHT_EMBEDDINGS, {
          insightIds: batch,
          workspaceId: null,
        });
        this.logger.log(`Re-indexed ${staleInsights.length} stale insights`);
      }
    } catch (err) {
      this.logger.warn(`Stale insight re-index failed: ${(err as Error).message}`);
    }
  }
}
