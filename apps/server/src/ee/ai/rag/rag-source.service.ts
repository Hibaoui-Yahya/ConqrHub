import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

/**
 * The fields a page-backed source gains after enrichment. Any object carrying
 * `sourceId` and `kind` can be enriched in place; non-page sources are left
 * untouched apart from `verified`, which is set to false because only pages
 * carry a verification record.
 */
export interface EnrichablePageSource {
  sourceId: string;
  kind: string;
  title?: string | null;
  slugId?: string;
  spaceSlug?: string;
  spaceName?: string;
  author?: string;
  updatedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verified?: boolean;
}

type PageSourceRow = {
  id: string;
  slugId: string | null;
  title: string | null;
  updatedAt: Date | string | null;
  spaceSlug: string | null;
  spaceName: string | null;
  authorName: string | null;
  verifiedAt: Date | string | null;
  verifierName: string | null;
  verificationStatus: string | null;
  verificationExpiresAt: Date | string | null;
};

/**
 * Resolves the page/space/verification details the client needs to link and
 * badge a retrieved source. Shared by the "Ask AI" answers endpoint; the chat
 * stream keeps its own private copy for now.
 */
@Injectable()
export class RagSourceService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Fill `slugId`, `spaceSlug`, `spaceName`, `author`, `updatedAt`,
   * `verifiedBy`, `verifiedAt` and `verified` on every page source, in place,
   * with one query. Sources whose page no longer exists keep their fields
   * undefined and `verified: false`. Returns the same array for chaining.
   */
  async enrichPageSources<T extends EnrichablePageSource>(
    sources: T[],
  ): Promise<T[]> {
    for (const s of sources) if (s.verified === undefined) s.verified = false;

    const pageIds = [
      ...new Set(
        sources.filter((s) => s.kind === 'page').map((s) => s.sourceId),
      ),
    ];
    if (pageIds.length === 0) return sources;

    const rows: PageSourceRow[] = await (this.db as any)
      .selectFrom('pages')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .leftJoin('users as author', 'author.id', 'pages.creatorId')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'pages.id')
      .leftJoin('users as verifier', 'verifier.id', 'pv.verifiedById')
      .select([
        'pages.id as id',
        'pages.slugId as slugId',
        'pages.title as title',
        'pages.updatedAt as updatedAt',
        'spaces.slug as spaceSlug',
        'spaces.name as spaceName',
        'author.name as authorName',
        'pv.verifiedAt as verifiedAt',
        'verifier.name as verifierName',
        'pv.status as verificationStatus',
        'pv.expiresAt as verificationExpiresAt',
      ])
      .where('pages.id', 'in', pageIds)
      .where('pages.deletedAt', 'is', null)
      .execute();

    const toIso = (v: Date | string | null): string | undefined =>
      v ? new Date(v).toISOString() : undefined;

    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const s of sources) {
      if (s.kind !== 'page') continue;
      const r = byId.get(s.sourceId);
      if (!r) continue;
      s.slugId = r.slugId ?? undefined;
      s.spaceSlug = r.spaceSlug ?? undefined;
      s.spaceName = r.spaceName ?? undefined;
      s.author = r.authorName ?? undefined;
      s.updatedAt = toIso(r.updatedAt);
      s.verifiedBy = r.verifierName ?? undefined;
      s.verifiedAt = toIso(r.verifiedAt);
      s.verified = isEffectivelyVerified(
        r.verificationStatus,
        r.verificationExpiresAt,
      );
      if (!s.title) s.title = r.title ?? null;
    }

    return sources;
  }
}

/**
 * Same rule as the embedding indexer's gate: `verified` or `expiring`, and
 * not past `expiresAt`.
 */
export function isEffectivelyVerified(
  status: string | null,
  expiresAt: Date | string | null,
): boolean {
  if (status !== 'verified' && status !== 'expiring') return false;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;
  return true;
}
