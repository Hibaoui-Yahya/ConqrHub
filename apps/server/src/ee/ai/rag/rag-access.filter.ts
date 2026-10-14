import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SimilarityResult } from '../embeddings/embedding.repository';
import { referencedAttachmentIds } from '../../attachments-ee/page-attachment-content.service';

export interface RagAccessContext {
  workspaceId: string;
  /** The reader. Without it nothing passes (fail closed). */
  userId?: string;
  /** Optional narrowing requested by the caller (never widens access). */
  spaceId?: string;
  spaceIds?: string[];
}

/**
 * Same rule as the indexer's gate: `verified` or `expiring`, not past
 * `expiresAt`.
 */
function isEffectivelyVerified(
  status: string | null | undefined,
  expiresAt: Date | string | null | undefined,
): boolean {
  if (status !== 'verified' && status !== 'expiring') return false;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;
  return true;
}

/**
 * Runtime gate between the embedding index and any prompt. Embedding rows
 * can be stale (cleanup jobs are asynchronous), so every retrieved chunk is
 * re-checked against the CURRENT state before its text may reach a model:
 *
 * - page chunks: page exists, is not deleted, is in the workspace, sits in a
 *   space the reader is a member of (and inside the caller's narrowing), is
 *   currently verified, and passes page-level restrictions for the reader
 *   (PagePermissionRepo.filterAccessiblePageIds);
 * - attached-document chunks additionally: the attachment still exists, still
 *   belongs to that page, is still referenced by an attachment node of the
 *   page body (the ingestion parser — a UUID left in plain text or a mention
 *   does not count), predates the page's current verification, and is the
 *   very version the chunk was extracted from (metadata.attachmentUpdatedAt;
 *   chunks without it are dropped until re-indexed);
 * - expert insights: published, not deleted or expired, and their page
 *   passes the same live/space/permission checks (insights carry no
 *   verification of their own);
 * - every other source kind is dropped.
 *
 * Any failure drops everything (fail closed).
 */
@Injectable()
export class RagAccessFilter {
  private readonly logger = new Logger(RagAccessFilter.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissions: PagePermissionRepo,
    private readonly spaceMembers: SpaceMemberRepo,
  ) {}

  async filter(
    results: SimilarityResult[],
    ctx: RagAccessContext,
  ): Promise<SimilarityResult[]> {
    if (results.length === 0) return [];
    if (!ctx.userId) {
      this.logger.error(
        'RAG access check without a reader: all passages dropped',
      );
      return [];
    }
    try {
      return await this.apply(
        results,
        ctx as RagAccessContext & { userId: string },
      );
    } catch (err) {
      this.logger.error(
        `RAG access check failed, all passages dropped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async apply(
    results: SimilarityResult[],
    ctx: RagAccessContext & { userId: string },
  ): Promise<SimilarityResult[]> {
    const { workspaceId, userId } = ctx;
    const attachmentIdOf = (r: SimilarityResult): string | null => {
      const id = r.metadata?.attachmentId;
      return typeof id === 'string' && id ? id : null;
    };

    const insightIds = uniq(
      results
        .filter((r) => r.sourceKind === 'expert_insight')
        .map((r) => r.sourceId),
    );
    const insights = insightIds.length
      ? await this.db
          .selectFrom('expertInsights')
          .select(['id', 'pageId'])
          .where('id', 'in', insightIds)
          .where('workspaceId', '=', workspaceId)
          .where('deletedAt', 'is', null)
          .where('status', '=', 'published')
          .where((eb) =>
            eb.or([
              eb('expiresAt', 'is', null),
              eb('expiresAt', '>', new Date()),
            ]),
          )
          .execute()
      : [];
    const insightPage = new Map(insights.map((i) => [i.id, i.pageId]));

    const pageIds = uniq([
      ...results.filter((r) => r.sourceKind === 'page').map((r) => r.sourceId),
      ...insights.map((i) => i.pageId),
    ]);
    if (pageIds.length === 0) return [];

    const pages = await this.db
      .selectFrom('pages as p')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
      .select([
        'p.id as id',
        'p.spaceId as spaceId',
        'pv.status as status',
        'pv.expiresAt as expiresAt',
      ])
      .where('p.id', 'in', pageIds)
      .where('p.workspaceId', '=', workspaceId)
      .where('p.deletedAt', 'is', null)
      .execute();

    const readable = new Set(await this.spaceMembers.getUserSpaceIds(userId));
    const inScope = (spaceId: string) =>
      readable.has(spaceId) &&
      (!ctx.spaceId || ctx.spaceId === spaceId) &&
      (!ctx.spaceIds || ctx.spaceIds.includes(spaceId));

    const candidates = pages.filter((p) => inScope(p.spaceId));
    const permitted = new Set(
      candidates.length
        ? await this.pagePermissions.filterAccessiblePageIds({
            pageIds: candidates.map((p) => p.id),
            userId,
          })
        : [],
    );
    const openPages = new Map(
      candidates.filter((p) => permitted.has(p.id)).map((p) => [p.id, p]),
    );

    const attachmentIds = uniq(
      results
        .filter((r) => r.sourceKind === 'page' && openPages.has(r.sourceId))
        .map(attachmentIdOf)
        .filter((id): id is string => !!id),
    );
    const liveAttachments = attachmentIds.length
      ? await this.db
          .selectFrom('attachments as a')
          .innerJoin('pages as p', 'p.id', 'a.pageId')
          .innerJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
          .select([
            'a.id as id',
            'a.pageId as pageId',
            'a.updatedAt as updatedAt',
            'p.content as content',
          ])
          .where('a.id', 'in', attachmentIds)
          .where('a.workspaceId', '=', workspaceId)
          .where('a.deletedAt', 'is', null)
          .where('a.type', '=', 'file')
          .whereRef('a.updatedAt', '<=', 'pv.verifiedAt')
          .execute()
      : [];
    // Still referenced by an attachment node of the CURRENT page body.
    const referencedBy = new Map<string, Set<string>>();
    const attachmentPage = new Map<string, { pageId: string; version: number }>();
    for (const a of liveAttachments) {
      let refs = referencedBy.get(a.pageId);
      if (!refs) {
        refs = new Set(referencedAttachmentIds(a.content));
        referencedBy.set(a.pageId, refs);
      }
      if (refs.has(a.id)) {
        attachmentPage.set(a.id, {
          pageId: a.pageId,
          version: new Date(a.updatedAt).getTime(),
        });
      }
    }
    const sameVersion = (r: SimilarityResult, live: { version: number }) => {
      const v = r.metadata?.attachmentUpdatedAt;
      const t = typeof v === 'string' ? new Date(v).getTime() : NaN;
      return Number.isFinite(t) && t === live.version;
    };

    return results.filter((r) => {
      if (r.sourceKind === 'page') {
        const page = openPages.get(r.sourceId);
        if (!page || !isEffectivelyVerified(page.status, page.expiresAt)) {
          return false;
        }
        const attachmentId = attachmentIdOf(r);
        if (!attachmentId) return true;
        const live = attachmentPage.get(attachmentId);
        return !!live && live.pageId === r.sourceId && sameVersion(r, live);
      }
      if (r.sourceKind === 'expert_insight') {
        const pageId = insightPage.get(r.sourceId);
        return !!pageId && openPages.has(pageId);
      }
      return false;
    });
  }
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}
