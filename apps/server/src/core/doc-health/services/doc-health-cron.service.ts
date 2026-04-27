import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';

const SNAPSHOT_JOB_ID = 'doc-health-snapshot-cron';
const PRUNE_JOB_ID = 'doc-health-prune-cron';
const BROKEN_LINKS_JOB_ID = 'doc-health-broken-links-cron';
const DUPLICATES_JOB_ID = 'doc-health-duplicates-cron';

// 02:00 UTC daily — outside the user-active window. Prune runs 30 minutes
// later so it never races the snapshot insert on the same row.
const SNAPSHOT_CRON = '0 2 * * *';
const PRUNE_CRON = '30 2 * * *';

// Weekly Sunday 03:00 UTC — broken-link scan is heavier than the daily
// snapshot since it walks every page's content. Sunday avoids weekday
// publishing patterns where workspaces are most active.
const BROKEN_LINKS_CRON = '0 3 * * 0';

// Weekly Sunday 04:00 UTC — duplicate detection runs an hour after the
// broken-link scan so the two heavy weekly jobs never compete for the
// same DB connection pool.
const DUPLICATES_CRON = '0 4 * * 0';

@Injectable()
export class DocHealthCronService implements OnModuleInit {
  private readonly logger = new Logger(DocHealthCronService.name);

  constructor(
    @InjectQueue(QueueName.GENERAL_QUEUE) private readonly generalQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.generalQueue.add(
        QueueJob.DOC_HEALTH_SNAPSHOT,
        {},
        {
          repeat: { pattern: SNAPSHOT_CRON },
          jobId: SNAPSHOT_JOB_ID,
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 30 },
        },
      );

      await this.generalQueue.add(
        QueueJob.DOC_HEALTH_PRUNE,
        {},
        {
          repeat: { pattern: PRUNE_CRON },
          jobId: PRUNE_JOB_ID,
          removeOnComplete: { count: 30 },
          removeOnFail: { count: 30 },
        },
      );

      await this.generalQueue.add(
        QueueJob.BROKEN_LINKS_SCAN_ALL,
        {},
        {
          repeat: { pattern: BROKEN_LINKS_CRON },
          jobId: BROKEN_LINKS_JOB_ID,
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 10 },
        },
      );

      await this.generalQueue.add(
        QueueJob.DUPLICATES_SCAN_ALL,
        {},
        {
          repeat: { pattern: DUPLICATES_CRON },
          jobId: DUPLICATES_JOB_ID,
          removeOnComplete: { count: 10 },
          removeOnFail: { count: 10 },
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(
        `Failed to register doc-health cron jobs: ${message}. ` +
          `Trends will not refresh until the workers can reach Redis.`,
      );
    }
  }
}
