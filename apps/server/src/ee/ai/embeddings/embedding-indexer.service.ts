import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChunkingService } from './chunking.service';
import {
  EmbeddingChunkInsert,
  EmbeddingRepository,
} from './embedding.repository';
import {
  AttachmentIndexPart,
  PageAttachmentContentService,
  referencedAttachmentIds,
} from '../../attachments-ee/page-attachment-content.service';

/**
 * The page (or one of its attachments) changed between reading it and storing
 * its embeddings. Thrown so the queue retries with fresh data instead of
 * storing a mix of old and new content.
 */
export class StaleIndexInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StaleIndexInputError';
  }
}

/** Bump when the attachment chunk format changes, to re-embed once. */
// 3: document chunks carry their source version (attachmentUpdatedAt),
// which retrieval requires; pages with documents are re-indexed once
// (vectors of unchanged chunk texts are reused).
const ATTACHMENT_CHUNK_FORMAT = 3;

/**
 * First line of every attachment chunk: names the document for citation and,
 * when only part of it was read, says so (the model must not present a
 * partial scan as the whole document).
 */
export function attachmentChunkHeader(
  fileName: string,
  coverage?: string,
): string {
  return coverage
    ? `[Attachment: ${fileName} (partial text: ${coverage})]`
    : `[Attachment: ${fileName}]`;
}

function sameInstant(a: unknown, b: unknown): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a as string).getTime() === new Date(b as string).getTime();
}

export interface IndexPageResult {
  pageId: string;
  status:
    | 'indexed'
    | 'skipped'
    | 'deleted'
    | 'no_content'
    | 'ai_unavailable'
    | 'not_verified';
  chunksIndexed?: number;
  /** Chunks whose vector was reused from the previous index (no embedding call). */
  chunksReused?: number;
  /** Attachments whose extracted text was indexed with the page. */
  attachmentsIndexed?: number;
}

/**
 * A page's content is eligible for the knowledge base only while it carries a
 * currently-valid verification. `verified` and `expiring` (verified but within
 * the expiry warning window) both count as valid; everything else — draft,
 * in_approval, approved, expired, obsolete, or no verification row at all —
 * does not. A past `expiresAt` also disqualifies regardless of stored status.
 */
function isEffectivelyVerified(
  v: { status: string | null; expiresAt: Date | null } | undefined,
): boolean {
  if (!v || (v.status !== 'verified' && v.status !== 'expiring')) return false;
  if (v.expiresAt && new Date(v.expiresAt).getTime() <= Date.now())
    return false;
  return true;
}

/**
 * Text handed to the embedding model for a page chunk: the page title on its
 * own line, then the chunk. Also the input of the page's content hash. A page
 * without a title embeds the bare chunk, so the hash of a title-less page is
 * the hash of its text.
 */
export function embeddingInput(title: string | null, text: string): string {
  const t = title?.trim();
  return t ? `${t}\n\n${text}` : text;
}

/**
 * Hash input for a page plus its attachments. Without attachments it is
 * exactly the historical page hash input, so existing embeddings of pages
 * without documents are not re-embedded after this change.
 */
export function pageContentHashInput(
  title: string | null,
  text: string,
  parts: Array<
    Pick<
      AttachmentIndexPart,
      'attachmentId' | 'fileName' | 'textSha256' | 'coverage'
    >
  >,
): string {
  const base = embeddingInput(title, text);
  if (parts.length === 0) return base;
  return [
    base,
    `\u0000attachments:v${ATTACHMENT_CHUNK_FORMAT}`,
    ...parts.map(
      (p) =>
        `${p.attachmentId}:${p.fileName}:${p.textSha256}:${p.coverage ?? ''}`,
    ),
  ].join('\n');
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
    @Optional()
    private readonly attachmentContent?: PageAttachmentContentService,
  ) {}

  async indexPage(
    pageId: string,
    workspaceId: string,
    opts: { attachmentFollowUp?: number } = {},
  ): Promise<IndexPageResult> {
    if (!this.aiProvider.isAvailable()) {
      return { pageId, status: 'ai_unavailable' };
    }

    const page = await (this.db as any)
      .selectFrom('pages')
      .select(['id', 'title', 'textContent', 'content', 'spaceId', 'deletedAt'])
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

    // Verification gate: only currently-verified content belongs in the
    // knowledge base. If the page is not verified (never verified, still in
    // draft/approval, expired, obsolete, or invalidated by a recent edit),
    // drop any existing embeddings so RAG never retrieves unverified content.
    const verification = await (this.db as any)
      .selectFrom('pageVerifications')
      .select(['status', 'expiresAt', 'verifiedAt'])
      .where('pageId', '=', pageId)
      .executeTakeFirst();

    if (!isEffectivelyVerified(verification)) {
      await this.repo.deleteBySource('page', pageId);
      return { pageId, status: 'not_verified' };
    }

    // Documents attached to the page. Only consulted for a verified page, and
    // files added or replaced after the verification are left out.
    let parts: AttachmentIndexPart[] = [];
    let attachmentsPending = false;
    if (this.attachmentContent) {
      const collected = await this.attachmentContent.collectForPage(
        {
          id: pageId,
          workspaceId,
          spaceId: page.spaceId,
          content: page.content,
        },
        verification.verifiedAt ?? null,
      );
      parts = collected.parts;
      attachmentsPending = collected.pending;
    }
    const followUp = async () => {
      if (attachmentsPending) {
        await this.attachmentContent?.scheduleFollowUp(
          pageId,
          workspaceId,
          (opts.attachmentFollowUp ?? 0) + 1,
        );
      }
    };

    const pageText: string = page.textContent?.trim() ? page.textContent : '';
    if (!pageText && parts.length === 0) {
      await this.repo.deleteBySource('page', pageId);
      await followUp();
      return { pageId, status: 'no_content' };
    }

    const model = this.env.getAiEmbeddingModel() || 'mistral-embed';
    const dim = this.aiProvider.getEmbeddingDimension();
    // The title is part of what gets embedded, so it is part of the hash: a
    // rename must re-embed even when the body is untouched.
    const title = page.title ?? null;
    const contentHash = this.chunking.contentHash(
      pageContentHashInput(title, pageText, parts),
    );

    const unchanged = await this.repo.isContentUnchanged(
      'page',
      pageId,
      model,
      contentHash,
    );
    if (unchanged) {
      await followUp();
      return { pageId, status: 'skipped' };
    }

    const chunkChars = this.env.getAiEmbeddingChunkChars();
    const overlap = this.env.getAiEmbeddingChunkOverlap();
    const batchSize = this.env.getAiEmbeddingBatchSize();

    const baseMetadata = { pageId, title, spaceId: page.spaceId, workspaceId };
    const planned: Array<{
      chunkText: string;
      metadata: Record<string, unknown>;
    }> = pageText
      ? this.chunking
          .chunk(pageText, { chunkChars, overlap })
          .map((c) => ({ chunkText: c.chunkText, metadata: baseMetadata }))
      : [];
    // Attachment chunks follow the page's own chunks under the same page
    // source, so retrieval, permission scoping and deletion are unchanged;
    // each one names its document so answers can cite it.
    for (const part of parts) {
      const header = attachmentChunkHeader(part.fileName, part.coverage);
      for (const c of this.chunking.chunk(part.text, { chunkChars, overlap })) {
        planned.push({
          chunkText: `${header}\n${c.chunkText}`,
          metadata: {
            ...baseMetadata,
            attachmentId: part.attachmentId,
            fileName: part.fileName,
            // Version of the bytes this text came from. Retrieval drops the
            // chunk once the live attachment is another version (replaced,
            // even if the page was re-verified before re-indexing ran).
            attachmentUpdatedAt: new Date(part.updatedAt).toISOString(),
            textSha256: part.textSha256,
          },
        });
      }
    }

    if (planned.length === 0) {
      await this.repo.deleteBySource('page', pageId);
      await followUp();
      return { pageId, status: 'no_content' };
    }

    // Embed the chunk with its page title in front so the vector carries the
    // page's topic even when the chunk itself never names it. The stored
    // chunk_text stays raw: it is what gets shown and lexically searched.
    // Vectors of chunks already embedded under the same title are reused, so
    // attaching one more document does not re-pay the rest of the page.
    const reusable = await this.repo.findReusableVectors(
      'page',
      pageId,
      model,
      title,
    );
    const vectors: Array<number[] | undefined> = planned.map((c) =>
      reusable.get(c.chunkText),
    );
    const missing = planned
      .map((c, i) => ({ i, input: embeddingInput(title, c.chunkText) }))
      .filter(({ i }) => !vectors[i]);

    for (let b = 0; b < missing.length; b += batchSize) {
      const batch = missing.slice(b, b + batchSize);
      const embedded = await this.aiProvider.embedMany(
        batch.map((m) => m.input),
      );
      batch.forEach((m, k) => {
        vectors[m.i] = embedded[k];
      });
    }

    const embeddingChunks: EmbeddingChunkInsert[] = planned.map((c, i) => ({
      chunkIndex: i,
      chunkText: c.chunkText,
      embedding: vectors[i],
      metadata: c.metadata,
    }));

    // Re-check eligibility under row locks right before writing: a page
    // unverified, deleted or moved, or a document replaced, while this pass
    // was extracting/embedding must not leave retrievable stale embeddings.
    const status: 'indexed' | 'deleted' | 'not_verified' = await (
      this.db as any
    )
      .transaction()
      .execute(async (trx: any) => {
        const current = await trx
          .selectFrom('pageVerifications')
          .select(['status', 'expiresAt', 'verifiedAt'])
          .where('pageId', '=', pageId)
          .forShare()
          .executeTakeFirst();
        const live = await trx
          .selectFrom('pages')
          .select(['spaceId', 'deletedAt', 'title', 'textContent', 'content'])
          .where('id', '=', pageId)
          .where('workspaceId', '=', workspaceId)
          .forShare()
          .executeTakeFirst();

        if (!live || live.deletedAt) {
          await this.repo.deleteBySource('page', pageId, trx);
          return 'deleted';
        }
        if (!isEffectivelyVerified(current)) {
          await this.repo.deleteBySource('page', pageId, trx);
          return 'not_verified';
        }
        if (live.spaceId !== page.spaceId) {
          throw new StaleIndexInputError(`Page ${pageId} moved while indexing`);
        }
        // The exact version that was embedded must still be the current one:
        // same title and text, same verification (a re-verification can make
        // other documents eligible), and every document used still
        // referenced by the page body.
        if (
          (live.title ?? null) !== (page.title ?? null) ||
          (live.textContent ?? '') !== (page.textContent ?? '') ||
          !sameInstant(current.verifiedAt, verification.verifiedAt)
        ) {
          throw new StaleIndexInputError(
            `Page ${pageId} changed or was re-verified while indexing`,
          );
        }
        if (parts.length > 0) {
          const referenced = new Set(referencedAttachmentIds(live.content));
          if (parts.some((p) => !referenced.has(p.attachmentId))) {
            throw new StaleIndexInputError(
              `A document was removed from page ${pageId} while indexing`,
            );
          }
        }
        if (
          parts.length > 0 &&
          !(await this.attachmentContent.stillCurrent(trx, pageId, parts))
        ) {
          throw new StaleIndexInputError(
            `An attachment of page ${pageId} changed while indexing`,
          );
        }

        await this.repo.upsertChunks(
          {
            workspaceId,
            spaceId: page.spaceId,
            sourceKind: 'page',
            sourceId: pageId,
            model,
            dim,
            contentHash,
            chunks: embeddingChunks,
          },
          trx,
        );
        return 'indexed';
      });

    await followUp();
    if (status !== 'indexed') return { pageId, status };

    const chunksReused = planned.length - missing.length;
    this.logger.debug(
      `Indexed page ${pageId}: ${planned.length} chunks (${chunksReused} reused, ${parts.length} attachment(s), model=${model})`,
    );

    return {
      pageId,
      status: 'indexed',
      chunksIndexed: planned.length,
      chunksReused,
      attachmentsIndexed: parts.length,
    };
  }

  /**
   * Refresh the space/workspace of a page's existing embeddings after it
   * moves spaces. Content is unchanged, so this avoids re-embedding and just
   * updates the tenancy columns from the page's current row. If the page is
   * gone or soft-deleted, its embeddings are removed instead.
   */
  async reassignPageSpace(pageId: string, workspaceId: string): Promise<void> {
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
