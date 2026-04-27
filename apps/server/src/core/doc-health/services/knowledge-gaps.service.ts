import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export const GAPS_DEFAULT_DAYS = 30;
export const GAPS_MAX_DAYS = 365;
export const GAPS_DEFAULT_MIN_OCCURRENCES = 2;
export const GAPS_DEFAULT_LIMIT = 25;
export const GAPS_MAX_LIMIT = 100;
export const GAPS_MIN_CONTENT_LENGTH = 6;

// A page hit older than this drives the `update_outdated` recommendation.
// Same threshold the issue list uses so the two views stay consistent.
const OUTDATED_DAYS = 180;

export type GapRecommendationKind =
  | 'create_page'
  | 'update_outdated'
  | 'assign_owner';

export type GapRecommendation = {
  kind: GapRecommendationKind;
  pageId?: string;
  pageSlugId?: string;
  pageTitle?: string | null;
  spaceSlug?: string;
  detail: string;
};

export type KnowledgeGap = {
  sampleQuestion: string;
  occurrences: number;
  lastAskedAt: string;
  uniqueAskers: number;
  recommendations: GapRecommendation[];
};

export type KnowledgeGapsResult = {
  items: KnowledgeGap[];
  rangeDays: number;
  scannedMessages: number;
};

type TopMatch = {
  id: string;
  slugId: string;
  title: string | null;
  ownerId: string | null;
  ownerActive: boolean;
  updatedAt: Date;
  spaceSlug: string;
};

@Injectable()
export class KnowledgeGapsService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findGaps(args: {
    workspaceId: string;
    days?: number;
    minOccurrences?: number;
    limit?: number;
  }): Promise<KnowledgeGapsResult> {
    const days = clamp(args.days ?? GAPS_DEFAULT_DAYS, 1, GAPS_MAX_DAYS);
    const minOccurrences = Math.max(2, args.minOccurrences ?? GAPS_DEFAULT_MIN_OCCURRENCES);
    const limit = clamp(args.limit ?? GAPS_DEFAULT_LIMIT, 1, GAPS_MAX_LIMIT);
    const since = new Date(Date.now() - days * 86_400_000);

    // Single round-trip: count total scanned + grouped recurring questions.
    const scannedRow = await this.db
      .selectFrom('aiChatMessages')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('workspaceId', '=', args.workspaceId)
      .where('role', '=', 'user')
      .where('deletedAt', 'is', null)
      .where('createdAt', '>=', since)
      .executeTakeFirst();

    const scannedMessages = Number(scannedRow?.count ?? 0);

    if (scannedMessages === 0) {
      return { items: [], rangeDays: days, scannedMessages: 0 };
    }

    // Group by a normalized hash of the message content so that re-phrasings
    // with different whitespace/case still cluster. Filter out trivially short
    // messages — they're noise (single-word follow-ups, "thanks", etc.).
    const rows = await sql<{
      sample: string;
      occurrences: string;
      last_asked_at: Date;
      unique_askers: string;
    }>`
      SELECT
        (array_agg(content ORDER BY created_at DESC))[1] AS sample,
        count(*) AS occurrences,
        max(created_at) AS last_asked_at,
        count(DISTINCT user_id) AS unique_askers
      FROM ai_chat_messages
      WHERE workspace_id = ${args.workspaceId}
        AND role = 'user'
        AND deleted_at IS NULL
        AND created_at >= ${since}
        AND content IS NOT NULL
        AND length(trim(content)) >= ${GAPS_MIN_CONTENT_LENGTH}
      GROUP BY md5(lower(regexp_replace(trim(content), '\\s+', ' ', 'g')))
      HAVING count(*) >= ${minOccurrences}
      ORDER BY count(*) DESC, max(created_at) DESC
      LIMIT ${limit}
    `.execute(this.db);

    // Per-gap, look up the strongest existing page match via the pages.tsv
    // full-text index. We do this in a single batched Promise.all rather
    // than N round-trips because the UI displays a couple dozen gaps at
    // once. Failures degrade gracefully — a gap without a top match still
    // emits the create_page recommendation.
    const topMatches = await Promise.all(
      rows.rows.map((r) =>
        this.findTopMatch(args.workspaceId, r.sample).catch(() => null),
      ),
    );

    const items: KnowledgeGap[] = rows.rows.map((r, idx) => ({
      sampleQuestion: r.sample,
      occurrences: Number(r.occurrences),
      lastAskedAt:
        r.last_asked_at instanceof Date
          ? r.last_asked_at.toISOString()
          : new Date(r.last_asked_at).toISOString(),
      uniqueAskers: Number(r.unique_askers),
      recommendations: buildRecommendations(r.sample, topMatches[idx]),
    }));

    return { items, rangeDays: days, scannedMessages };
  }

  /**
   * Find the workspace's best-matching existing page for a question via
   * the pages.tsv full-text index. Returns null if there's no
   * meaningfully-ranked hit — the FTS tsquery may be empty for very short
   * or stop-word-only questions, in which case we'd rather show no
   * "update existing page" suggestion than a random page.
   */
  private async findTopMatch(
    workspaceId: string,
    question: string,
  ): Promise<TopMatch | null> {
    const trimmed = question.trim();
    if (trimmed.length < GAPS_MIN_CONTENT_LENGTH) return null;

    const rows = await sql<{
      id: string;
      slug_id: string;
      title: string | null;
      owner_id: string | null;
      owner_deactivated_at: Date | null;
      owner_deleted_at: Date | null;
      updated_at: Date;
      space_slug: string;
    }>`
      SELECT
        p.id,
        p.slug_id,
        p.title,
        p.owner_id,
        u.deactivated_at AS owner_deactivated_at,
        u.deleted_at AS owner_deleted_at,
        p.updated_at,
        s.slug AS space_slug
      FROM pages p
      INNER JOIN spaces s ON s.id = p.space_id
      LEFT JOIN users u ON u.id = p.owner_id
      WHERE p.workspace_id = ${workspaceId}
        AND p.deleted_at IS NULL
        AND p.tsv @@ websearch_to_tsquery('english', ${trimmed})
      ORDER BY ts_rank(p.tsv, websearch_to_tsquery('english', ${trimmed})) DESC
      LIMIT 1
    `.execute(this.db);

    const row = rows.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      slugId: row.slug_id,
      title: row.title,
      ownerId: row.owner_id,
      ownerActive:
        row.owner_id !== null &&
        row.owner_deactivated_at === null &&
        row.owner_deleted_at === null,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at
          : new Date(row.updated_at),
      spaceSlug: row.space_slug,
    };
  }
}

export function buildRecommendations(
  question: string,
  topMatch: TopMatch | null,
): GapRecommendation[] {
  const out: GapRecommendation[] = [];

  // Always offer "create a page" — even when a top match exists, the
  // canonical answer for a recurring question may be a new dedicated page.
  out.push({
    kind: 'create_page',
    detail: `Create a page titled "${deriveTitle(question)}"`,
  });

  if (!topMatch) return out;

  const ageDays = Math.floor(
    (Date.now() - topMatch.updatedAt.getTime()) / 86_400_000,
  );

  if (ageDays >= OUTDATED_DAYS) {
    out.push({
      kind: 'update_outdated',
      pageId: topMatch.id,
      pageSlugId: topMatch.slugId,
      pageTitle: topMatch.title,
      spaceSlug: topMatch.spaceSlug,
      detail: `Refresh "${topMatch.title ?? 'an outdated page'}" — last updated ${ageDays} days ago`,
    });
  }

  if (!topMatch.ownerActive) {
    out.push({
      kind: 'assign_owner',
      pageId: topMatch.id,
      pageSlugId: topMatch.slugId,
      pageTitle: topMatch.title,
      spaceSlug: topMatch.spaceSlug,
      detail: `Assign an owner to "${topMatch.title ?? 'a related page'}"`,
    });
  }

  return out;
}

export function deriveTitle(question: string): string {
  // Strip trailing punctuation, collapse whitespace, capitalize first
  // letter. Keeps the suggestion lightweight — the user can refine it
  // when they actually open the create-page form.
  const cleaned = question
    .trim()
    .replace(/[?.!]+$/u, '')
    .replace(/\s+/g, ' ');
  if (cleaned.length === 0) return 'Untitled';
  // Cap suggested title length so a long rambling question doesn't
  // produce a 400-char page title.
  const capped = cleaned.length > 80 ? cleaned.slice(0, 80).trim() + '…' : cleaned;
  return capped[0].toUpperCase() + capped.slice(1);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
