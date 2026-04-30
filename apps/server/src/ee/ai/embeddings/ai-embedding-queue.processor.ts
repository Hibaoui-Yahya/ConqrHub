import { Logger, OnModuleDestroy } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { EmbeddingIndexerService } from './embedding-indexer.service';
import { EmbeddingRepository } from './embedding.repository';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

interface PageJobPayload {
  pageIds: string[];
  workspaceId: string;
}

interface WorkspaceJobPayload {
  workspaceId: string;
}

interface SpaceJobPayload {
  spaceId: string;
}

@Processor(QueueName.AI_QUEUE)
export class AiEmbeddingQueueProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(AiEmbeddingQueueProcessor.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly indexer: EmbeddingIndexerService,
    private readonly repo: EmbeddingRepository,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case QueueJob.PAGE_CREATED:
      case QueueJob.PAGE_CONTENT_UPDATED:
      case QueueJob.PAGE_RESTORED:
      case QueueJob.GENERATE_PAGE_EMBEDDINGS: {
        const { pageIds, workspaceId } = job.data as PageJobPayload;
        await this.indexPages(pageIds, workspaceId);
        break;
      }

      case QueueJob.PAGE_UPDATED: {
        const { pageIds, workspaceId } = job.data as PageJobPayload;
        await this.indexPages(pageIds, workspaceId);
        break;
      }

      case QueueJob.PAGE_SOFT_DELETED:
      case QueueJob.PAGE_DELETED:
      case QueueJob.DELETE_PAGE_EMBEDDINGS: {
        const { pageIds } = job.data as PageJobPayload;
        await this.indexer.deletePageEmbeddingsBatch(pageIds);
        this.logger.debug(
          `Deleted embeddings for ${pageIds.length} page(s)`,
        );
        break;
      }

      case QueueJob.PAGE_MOVED_TO_SPACE: {
        // Space-id on the embedding row is now stale; re-index to refresh it.
        const { pageIds, workspaceId } = job.data as PageJobPayload;
        await this.indexPages(pageIds, workspaceId);
        break;
      }

      case QueueJob.WORKSPACE_CREATE_EMBEDDINGS: {
        const { workspaceId } = job.data as WorkspaceJobPayload;
        await this.indexWorkspace(workspaceId);
        break;
      }

      case QueueJob.WORKSPACE_DELETE_EMBEDDINGS: {
        const { workspaceId } = job.data as WorkspaceJobPayload;
        await this.repo.deleteByWorkspace(workspaceId);
        this.logger.log(`Deleted all embeddings for workspace ${workspaceId}`);
        break;
      }

      case QueueJob.SPACE_DELETED: {
        const { spaceId } = job.data as SpaceJobPayload;
        await this.repo.deleteBySpace(spaceId);
        this.logger.debug(`Deleted embeddings for space ${spaceId}`);
        break;
      }

      default:
        // Other AI queue jobs (e.g., PAGE_MOVED_TO_SPACE from workspace.service)
        // that this processor doesn't own — silently skip.
        break;
    }
  }

  private async indexPages(
    pageIds: string[],
    workspaceId: string,
  ): Promise<void> {
    for (const pageId of pageIds) {
      try {
        const result = await this.indexer.indexPage(pageId, workspaceId);
        if (result.status === 'indexed') {
          this.logger.debug(
            `Indexed page ${pageId}: ${result.chunksIndexed} chunk(s)`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to index page ${pageId}: ${msg}`);
        throw err;
      }
    }
  }

  private async indexWorkspace(workspaceId: string): Promise<void> {
    const pages: { id: string }[] = await (this.db as any)
      .selectFrom('pages')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();

    this.logger.log(
      `Indexing ${pages.length} pages for workspace ${workspaceId}`,
    );

    for (const page of pages) {
      try {
        await this.indexer.indexPage(page.id, workspaceId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Workspace index: failed page ${page.id}: ${msg}`,
        );
      }
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Processing AI job: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    this.logger.error(
      `AI job failed: ${job.name} — ${job.failedReason}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Completed AI job: ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
