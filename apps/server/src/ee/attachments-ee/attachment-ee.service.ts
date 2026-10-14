import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  AttachmentExtractionService,
  EXTRACTOR_VERSION,
  ExtractableAttachment,
  isIngestibleAttachment,
} from './attachment-extraction.service';
import { referencedAttachmentIds } from './page-attachment-content.service';

/** Attachments handled by one workspace-level (native-only) indexing job. */
export const MAX_WORKSPACE_NATIVE_BATCH = 200;

const ATTACHMENT_COLUMNS = [
  'id',
  'workspaceId',
  'pageId',
  'spaceId',
  'type',
  'fileName',
  'fileExt',
  'mimeType',
  'fileSize',
  'filePath',
  'updatedAt',
  'deletedAt',
  'aiChatId',
  'insightId',
  'textContent',
] as const;

/**
 * Entry point the core AttachmentProcessor resolves at runtime for the
 * ATTACHMENT_INDEX_CONTENT / ATTACHMENT_INDEXING jobs (see
 * core/attachment/processors/attachment.processor.ts).
 *
 * Upload-time work is native-only: it prepares draft text for page documents
 * without any paid OCR. If the page is currently verified and references the
 * file, a page re-index is queued; the indexer then decides whether the file
 * may enter the knowledge base (it may not if it was added or replaced after
 * the page's verification).
 */
@Injectable()
export class AttachmentEeService {
  private readonly logger = new Logger(AttachmentEeService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly extraction: AttachmentExtractionService,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  async indexAttachment(attachmentId: string): Promise<void> {
    const att = (await this.db
      .selectFrom('attachments')
      .select([...ATTACHMENT_COLUMNS])
      .where('id', '=', attachmentId)
      .executeTakeFirst()) as ExtractableAttachment | undefined;
    if (!att || !isIngestibleAttachment(att)) return;

    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'deletedAt', 'content'])
      .where('id', '=', att.pageId)
      .where('workspaceId', '=', att.workspaceId)
      .executeTakeFirst();
    if (!page || page.deletedAt) return;

    const outcome = await this.extraction.ensureExtracted(att, {
      allowOcr: false,
    });
    this.logger.debug(
      `Attachment ${att.id}: ${outcome.status}${outcome.reused ? ` (${outcome.reused})` : ''}`,
    );

    if (!referencedAttachmentIds(page.content).includes(att.id)) return;
    const verification = await this.db
      .selectFrom('pageVerifications')
      .select(['status'])
      .where('pageId', '=', page.id)
      .executeTakeFirst();
    if (
      verification?.status === 'verified' ||
      verification?.status === 'expiring'
    ) {
      // The indexer re-checks verification and exclusion rules itself.
      await this.aiQueue.add(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
        pageIds: [page.id],
        workspaceId: page.workspaceId,
      });
    }
  }

  /**
   * Native-only catch-up for page documents of a workspace that have never
   * been processed. Bounded per job and never calls OCR.
   */
  async indexAttachments(workspaceId: string): Promise<void> {
    const rows = (await this.db
      .selectFrom('attachments as a')
      .select(ATTACHMENT_COLUMNS.map((c) => `a.${c}` as const))
      .innerJoin('pages as p', 'p.id', 'a.pageId')
      .where('a.workspaceId', '=', workspaceId)
      .where('p.workspaceId', '=', workspaceId)
      .where('p.deletedAt', 'is', null)
      .where('a.type', '=', 'file')
      .where('a.deletedAt', 'is', null)
      .where('a.aiChatId', 'is', null)
      .where('a.insightId', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('attachmentTextExtractions as e')
              .select('e.attachmentId')
              .whereRef('e.attachmentId', '=', 'a.id')
              .where('e.extractorVersion', '=', EXTRACTOR_VERSION),
          ),
        ),
      )
      .orderBy('a.createdAt', 'desc')
      .limit(MAX_WORKSPACE_NATIVE_BATCH)
      .execute()) as ExtractableAttachment[];

    let done = 0;
    for (const att of rows) {
      try {
        await this.extraction.ensureExtracted(att, { allowOcr: false });
        done++;
      } catch (err) {
        this.logger.warn(
          `Native extraction failed for attachment ${att.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `Workspace ${workspaceId}: native extraction for ${done}/${rows.length} attachment(s)`,
    );
  }
}
