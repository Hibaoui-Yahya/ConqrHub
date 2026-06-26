import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';

const EXPIRING_WINDOW_DAYS = 7;

@Injectable()
export class PageVerificationSchedulerService {
  private readonly logger = new Logger(PageVerificationSchedulerService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private notificationQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
  ) {}

  async reconcile(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const verifications = await this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('type', '=', 'expiring')
      .where('status', '=', 'verified')
      .where('expiresAt', 'is not', null)
      .execute();

    let expiredCount = 0;
    let expiringCount = 0;

    for (const v of verifications) {
      if (!v.expiresAt) continue;

      const expiresMs = new Date(v.expiresAt).getTime();
      const nowMs = now.getTime();

      if (expiresMs <= nowMs) {
        await this.db
          .updateTable('pageVerifications')
          .set({ status: 'expired', updatedAt: now })
          .where('id', '=', v.id)
          .execute();

        await this.notificationQueue.add(QueueJob.PAGE_VERIFICATION_EXPIRED, {
          verificationId: v.id,
        });

        // Expired content is no longer verified — drop it from the knowledge
        // base. The indexer removes embeddings for a now-unverified page.
        try {
          await this.aiQueue.add(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
            pageIds: [v.pageId],
            workspaceId: v.workspaceId,
          });
        } catch (err) {
          this.logger.error(
            `Failed to enqueue RAG sync for expired page ${v.pageId}`,
            err,
          );
        }
        expiredCount++;
      } else if (expiresMs <= windowEnd.getTime()) {
        await this.db
          .updateTable('pageVerifications')
          .set({ status: 'expiring', updatedAt: now })
          .where('id', '=', v.id)
          .execute();

        await this.notificationQueue.add(QueueJob.PAGE_VERIFICATION_EXPIRING, {
          verificationId: v.id,
        });
        expiringCount++;
      }
    }

    if (expiredCount > 0 || expiringCount > 0) {
      this.logger.log(
        'Verification reconcile: ' + expiredCount + ' expired, ' + expiringCount + ' expiring',
      );
    }
  }
}
