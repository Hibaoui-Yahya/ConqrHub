import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  EXTRACTOR_VERSION,
  MAX_FAILED_RUNS,
} from './attachment-extraction.service';
import { AiProviderService } from '../ai/providers/ai-provider.service';
import { METADATA_OBJECT } from '../ai/embeddings/embedding.repository';

/** Pages queued per reconciliation run and per category. */
export const RECONCILE_PAGE_LIMIT = 50;

/**
 * Catches up on events the queues missed (worker down, job dropped, deploy
 * while a file was uploaded), without any workspace-wide OCR:
 *
 * 1. currently-verified pages that own page documents with no current
 *    extraction, a pending OCR, or a failed run still under the retry cap;
 * 2. pages whose embeddings still carry an attachment that has since been
 *    deleted or detached from the page.
 *
 * It only queues GENERATE_PAGE_EMBEDDINGS jobs; the indexer re-applies the
 * verification gate and the per-pass OCR budget, and content hashes make an
 * unchanged page a no-op.
 */
@Injectable()
export class AttachmentIngestionReconciler {
  private readonly logger = new Logger(AttachmentIngestionReconciler.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
    private readonly ai: AiProviderService,
  ) {}

  @Cron('20 * * * *')
  async reconcile(): Promise<number> {
    try {
      const pending = await this.pagesWithPendingDocuments();
      const stale = await this.pagesWithStaleAttachmentEmbeddings();
      const byWorkspace = new Map<string, Set<string>>();
      for (const r of [...pending, ...stale]) {
        const set = byWorkspace.get(r.workspaceId) ?? new Set<string>();
        set.add(r.pageId);
        byWorkspace.set(r.workspaceId, set);
      }
      let queued = 0;
      for (const [workspaceId, pageIds] of byWorkspace) {
        await this.aiQueue.add(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
          pageIds: [...pageIds],
          workspaceId,
        });
        queued += pageIds.size;
      }
      if (queued > 0) {
        this.logger.log(
          `Queued ${queued} page(s) for attachment reconciliation`,
        );
      }
      return queued;
    } catch (err) {
      this.logger.warn(
        `Attachment reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 0;
    }
  }

  async pagesWithPendingDocuments(): Promise<
    Array<{ pageId: string; workspaceId: string }>
  > {
    const ocrAvailable = this.ai.isOcrAvailable();
    return (
      this.db
        .selectFrom('pages as p')
        .innerJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
        .innerJoin('attachments as a', 'a.pageId', 'p.id')
        .leftJoin('attachmentTextExtractions as e', 'e.attachmentId', 'a.id')
        .select(['p.id as pageId', 'p.workspaceId as workspaceId'])
        .where('p.deletedAt', 'is', null)
        .where('pv.status', 'in', ['verified', 'expiring'])
        .where((eb) =>
          eb.or([
            eb('pv.expiresAt', 'is', null),
            eb('pv.expiresAt', '>', new Date()),
          ]),
        )
        // Only files the verifier could have seen.
        .whereRef('a.updatedAt', '<=', 'pv.verifiedAt')
        .whereRef('a.workspaceId', '=', 'p.workspaceId')
        .where('a.type', '=', 'file')
        .where('a.deletedAt', 'is', null)
        .where('a.aiChatId', 'is', null)
        .where('a.insightId', 'is', null)
        // Still referenced by the page body (cheap textual check; the indexer
        // does the exact ProseMirror walk).
        .where(sql<boolean>`position(a.id::text in p.content::text) > 0`)
        .where((eb) => {
          const stale = [
            eb('e.attachmentId', 'is', null),
            eb('e.extractorVersion', '!=', EXTRACTOR_VERSION),
            eb(
              'e.sourceUpdatedAt',
              'is distinct from',
              sql<Date>`date_trunc('milliseconds', a.updated_at)`,
            ),
          ];
          // OCR work is only worth queueing when OCR can actually run.
          if (ocrAvailable) {
            stale.push(
              eb('e.status', '=', 'needs_ocr'),
              eb.and([
                eb('e.status', '=', 'failed'),
                eb('e.attempts', '<', MAX_FAILED_RUNS),
              ]),
              // Mixed PDFs whose scanned pages are still waiting for OCR.
              eb.and([
                eb('e.status', '=', 'partial'),
                eb('e.detail', 'like', '%pages_without_text%'),
                eb('e.attempts', '<', MAX_FAILED_RUNS),
              ]),
            );
          }
          return eb.or(stale);
        })
        .groupBy(['p.id', 'p.workspaceId'])
        .limit(RECONCILE_PAGE_LIMIT)
        .execute()
    );
  }

  async pagesWithStaleAttachmentEmbeddings(): Promise<
    Array<{ pageId: string; workspaceId: string }>
  > {
    const rows = await sql<{ pageId: string; workspaceId: string }>`
      SELECT DISTINCT e.source_id AS "pageId", e.workspace_id AS "workspaceId"
      FROM (
        SELECT source_id, workspace_id, ${METADATA_OBJECT} AS meta
        FROM ai_embeddings
        WHERE source_kind = 'page'
      ) e
      WHERE e.meta ? 'attachmentId'
        AND NOT EXISTS (
          SELECT 1 FROM attachments a
          WHERE a.id::text = e.meta->>'attachmentId'
            AND a.page_id = e.source_id
            AND a.deleted_at IS NULL
        )
      LIMIT ${RECONCILE_PAGE_LIMIT}
    `.execute(this.db);
    return rows.rows;
  }
}
