import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { validate as isValidUUID } from 'uuid';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  AttachmentExtractionService,
  ExtractableAttachment,
} from './attachment-extraction.service';

/** Attachments of one page considered per index pass. */
export const MAX_ATTACHMENTS_PER_PAGE = 20;
/** Documents OCR'd per index pass; the rest wait for a follow-up pass. */
export const MAX_OCR_PER_PASS = 3;
/** Characters of one attachment that are embedded. */
export const MAX_ATTACHMENT_INDEX_CHARS = 60_000;
/** Characters of all attachments of one page that are embedded. */
export const MAX_PAGE_ATTACHMENT_INDEX_CHARS = 200_000;
/** Follow-up passes scheduled for one page while extraction is pending. */
export const MAX_ATTACHMENT_FOLLOW_UPS = 5;
const FOLLOW_UP_DELAY_MS = 2 * 60 * 1000;

const ATTACHMENT_NODE_TYPES = new Set([
  'attachment',
  'image',
  'pdf',
  'excalidraw',
  'drawio',
]);

/**
 * Attachment ids referenced by the page's current ProseMirror content. Only
 * these count as "belonging" to the page: a file removed from the page body
 * stops contributing even while its attachment row survives.
 */
export function referencedAttachmentIds(content: unknown): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let root = content;
  if (typeof root === 'string') {
    // Content stored as a JSON string scalar (raw SQL writers) still counts.
    try {
      root = JSON.parse(root);
    } catch {
      return ids;
    }
  }
  const stack: unknown[] = [root];
  let budget = 200_000;
  while (stack.length && budget-- > 0) {
    const node = stack.pop() as {
      type?: unknown;
      attrs?: { attachmentId?: unknown };
      content?: unknown;
    } | null;
    if (!node || typeof node !== 'object') continue;
    // Children are pushed in reverse so ids come out in document order.
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    const id = node.attrs?.attachmentId;
    if (
      typeof node.type === 'string' &&
      ATTACHMENT_NODE_TYPES.has(node.type) &&
      typeof id === 'string' &&
      isValidUUID(id) &&
      !seen.has(id)
    ) {
      seen.add(id);
      ids.push(id);
    }
    if (Array.isArray(node.content)) {
      for (let i = node.content.length - 1; i >= 0; i--) {
        stack.push(node.content[i]);
      }
    }
  }
  return ids;
}

export interface AttachmentIndexPart {
  attachmentId: string;
  fileName: string;
  text: string;
  textSha256: string;
  /** attachments.updated_at of the bytes the text came from. */
  updatedAt: Date;
  /**
   * Set when the text does not cover the whole document (OCR page limit,
   * scanned pages left, extraction or index character limits).
   */
  coverage?: string;
}

export interface PageForAttachments {
  id: string;
  workspaceId: string;
  spaceId: string;
  content: unknown;
}

/**
 * Supplies the extracted text of the documents attached to a page to the
 * embedding indexer. It is only consulted for pages that are currently
 * verified, and only attachments that existed before that verification are
 * used: a document added or replaced afterwards is unverified content and
 * waits for the page's next verification.
 */
@Injectable()
export class PageAttachmentContentService {
  private readonly logger = new Logger(PageAttachmentContentService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly extraction: AttachmentExtractionService,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  async collectForPage(
    page: PageForAttachments,
    verifiedAt: Date | null,
  ): Promise<{ parts: AttachmentIndexPart[]; pending: boolean }> {
    const ids = referencedAttachmentIds(page.content);
    if (ids.length === 0) return { parts: [], pending: false };
    if (!verifiedAt) {
      // A verified row without a timestamp: nothing proves which files the
      // verifier saw, so index none of them.
      return { parts: [], pending: false };
    }

    const rows = await this.db
      .selectFrom('attachments')
      .select([
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
      ])
      .where('id', 'in', ids)
      .where('pageId', '=', page.id)
      .where('workspaceId', '=', page.workspaceId)
      .where('deletedAt', 'is', null)
      .where('type', '=', 'file')
      .where('aiChatId', 'is', null)
      .where('insightId', 'is', null)
      .where((eb) =>
        eb.or([eb('spaceId', 'is', null), eb('spaceId', '=', page.spaceId)]),
      )
      .orderBy('createdAt', 'asc')
      .limit(MAX_ATTACHMENTS_PER_PAGE)
      .execute();

    const budget = { remaining: MAX_OCR_PER_PASS };
    const parts: AttachmentIndexPart[] = [];
    let pending = false;
    let total = 0;

    for (const row of rows) {
      if (new Date(row.updatedAt).getTime() > new Date(verifiedAt).getTime()) {
        continue; // added or replaced after the verification
      }
      try {
        const outcome = await this.extraction.ensureExtracted(
          row as ExtractableAttachment,
          { allowOcr: true, ocrBudget: budget },
        );
        if (outcome.status === 'busy' || outcome.status === 'deferred') {
          pending = true;
          continue;
        }
        if (
          (outcome.status !== 'extracted' && outcome.status !== 'partial') ||
          !outcome.text ||
          !outcome.textSha256
        ) {
          continue;
        }
        const room = Math.min(
          MAX_ATTACHMENT_INDEX_CHARS,
          MAX_PAGE_ATTACHMENT_INDEX_CHARS - total,
        );
        if (room <= 0) break;
        const text = outcome.text.slice(0, room);
        total += text.length;
        const coverage = [
          outcome.status === 'partial' ? outcome.reason || 'partial' : null,
          text.length < outcome.text.length ? 'index_char_limit' : null,
        ]
          .filter(Boolean)
          .join(',');
        parts.push({
          attachmentId: row.id,
          fileName: row.fileName,
          text,
          textSha256: outcome.textSha256,
          updatedAt: row.updatedAt,
          ...(coverage ? { coverage } : {}),
        });
      } catch (err) {
        // Storage or extractor outage: index the page without this file now
        // and come back for it.
        pending = true;
        this.logger.warn(
          `Attachment ${row.id} of page ${page.id} not extracted: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return { parts, pending };
  }

  /**
   * Re-check, inside the indexer's transaction and under row locks, that every
   * attachment used is still attached to the page with the same bytes.
   */
  async stillCurrent(
    trx: KyselyTransaction,
    pageId: string,
    parts: AttachmentIndexPart[],
  ): Promise<boolean> {
    if (parts.length === 0) return true;
    const rows = await trx
      .selectFrom('attachments')
      .select(['id', 'updatedAt'])
      .where(
        'id',
        'in',
        parts.map((p) => p.attachmentId),
      )
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .forShare()
      .execute();
    const byId = new Map(rows.map((r) => [r.id, r.updatedAt]));
    return parts.every(
      (p) =>
        byId.has(p.attachmentId) &&
        new Date(byId.get(p.attachmentId)).getTime() ===
          new Date(p.updatedAt).getTime(),
    );
  }

  /** Bounded, de-duplicated follow-up pass for a page with pending extraction. */
  async scheduleFollowUp(
    pageId: string,
    workspaceId: string,
    attempt: number,
  ): Promise<void> {
    if (attempt > MAX_ATTACHMENT_FOLLOW_UPS) {
      this.logger.warn(
        `Page ${pageId}: attachment extraction still pending after ${MAX_ATTACHMENT_FOLLOW_UPS} follow-ups; the hourly reconciliation will retry`,
      );
      return;
    }
    try {
      await this.aiQueue.add(
        QueueJob.GENERATE_PAGE_EMBEDDINGS,
        { pageIds: [pageId], workspaceId, attachmentFollowUp: attempt },
        {
          delay: FOLLOW_UP_DELAY_MS * attempt,
          jobId: `page-attachments-${pageId}-${attempt}-${Math.floor(Date.now() / FOLLOW_UP_DELAY_MS)}`,
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule attachment follow-up for page ${pageId}`,
        err,
      );
    }
  }
}
