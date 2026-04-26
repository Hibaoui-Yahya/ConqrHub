import { Logger, OnModuleDestroy } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueJob, QueueName } from '../constants';
import {
  IAddPageWatchersJob,
  IPageBacklinkJob,
} from '../constants/queue.interface';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { BacklinkRepo } from '@docmost/db/repos/backlink/backlink.repo';
import {
  WatcherRepo,
  WatcherType,
} from '@docmost/db/repos/watcher/watcher.repo';
import { InsertableWatcher } from '@docmost/db/types/entity.types';
import { processBacklinks } from '../tasks/backlinks.task';
import { HealthSnapshotService } from '../../../core/doc-health/services/snapshot.service';

@Processor(QueueName.GENERAL_QUEUE)
export class GeneralQueueProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(GeneralQueueProcessor.name);
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly backlinkRepo: BacklinkRepo,
    private readonly watcherRepo: WatcherRepo,
    private readonly moduleRef: ModuleRef,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    try {
      switch (job.name) {
        case QueueJob.ADD_PAGE_WATCHERS: {
          const { userIds, pageId, spaceId, workspaceId } =
            job.data as IAddPageWatchersJob;
          const watchers: InsertableWatcher[] = userIds.map((userId) => ({
            userId,
            pageId,
            spaceId,
            workspaceId,
            type: WatcherType.PAGE,
            addedById: userId,
          }));
          await this.watcherRepo.insertMany(watchers);
          break;
        }

        case QueueJob.PAGE_BACKLINKS: {
          await processBacklinks(
            this.db,
            this.backlinkRepo,
            job.data as IPageBacklinkJob,
          );
          break;
        }

        case QueueJob.DOC_HEALTH_SNAPSHOT: {
          const snapshot = this.moduleRef.get(HealthSnapshotService, {
            strict: false,
          });
          if (!snapshot) {
            this.logger.warn(
              'DOC_HEALTH_SNAPSHOT fired but service not resolvable',
            );
            return;
          }
          const { captured, failed } = await snapshot.captureAll();
          this.logger.log(
            `Doc-health snapshot complete: ${captured} captured, ${failed} failed`,
          );
          break;
        }

        case QueueJob.DOC_HEALTH_PRUNE: {
          const snapshot = this.moduleRef.get(HealthSnapshotService, {
            strict: false,
          });
          if (!snapshot) return;
          const removed = await snapshot.pruneOlderThan();
          if (removed > 0) {
            this.logger.log(`Doc-health pruned ${removed} old snapshots`);
          }
          break;
        }
      }
    } catch (err) {
      throw err;
    }
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    this.logger.debug(`Processing ${job.name} job`);
  }

  @OnWorkerEvent('failed')
  onError(job: Job) {
    this.logger.error(
      `Error processing ${job.name} job. Reason: ${job.failedReason}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Completed ${job.name} job`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
