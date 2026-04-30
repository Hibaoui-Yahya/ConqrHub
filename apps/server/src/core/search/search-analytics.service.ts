import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

export const SEARCH_QUERY_MAX_LENGTH = 200;
export const SEARCH_CLICK_WINDOW_SECONDS = 300;
export const SEARCH_SUCCESS_WINDOW_DAYS = 30;
// Retain 90 days of events: 3× the success-ratio window so we can lengthen
// the window later without having already deleted the underlying rows.
export const SEARCH_EVENT_RETENTION_DAYS = 90;
export const SEARCH_GAPS_DEFAULT_DAYS = 30;
export const SEARCH_GAPS_MAX_DAYS = 90;
export const SEARCH_GAPS_DEFAULT_MIN_OCCURRENCES = 2;
export const SEARCH_GAPS_DEFAULT_LIMIT = 25;
export const SEARCH_GAPS_MAX_LIMIT = 100;

export type SearchGapCategory = 'no_results' | 'no_click';

export type SearchGapItem = {
  query: string;
  category: SearchGapCategory;
  occurrences: number;
  uniqueAskers: number;
  lastAskedAt: string;
  avgResultCount: number;
};

export type SearchGapsResult = {
  items: SearchGapItem[];
  rangeDays: number;
  totalQueries: number;
};

export type SearchEventType = 'query' | 'click';

export type WorkspaceSearchSuccess = {
  totalQueries: number;
  successfulQueries: number;
  ratio: number | null;
};

@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  static normalizeQuery(query: string): string {
    return query.trim().slice(0, SEARCH_QUERY_MAX_LENGTH).toLowerCase();
  }

  async logQuery(args: {
    workspaceId: string;
    userId: string | null;
    query: string;
    resultCount: number;
  }): Promise<void> {
    const normalized = SearchAnalyticsService.normalizeQuery(args.query);
    if (normalized.length === 0) return;

    try {
      await this.db
        .insertInto('searchEvents')
        .values({
          workspaceId: args.workspaceId,
          userId: args.userId,
          eventType: 'query',
          query: normalized,
          resultCount: args.resultCount,
          pageId: null,
        })
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Failed to log search query event: ${message}`);
    }
  }

  async logClick(args: {
    workspaceId: string;
    userId: string | null;
    query: string;
    pageId: string;
  }): Promise<void> {
    const normalized = SearchAnalyticsService.normalizeQuery(args.query);
    if (normalized.length === 0) return;

    try {
      await this.db
        .insertInto('searchEvents')
        .values({
          workspaceId: args.workspaceId,
          userId: args.userId,
          eventType: 'click',
          query: normalized,
          resultCount: null,
          pageId: args.pageId,
        })
        .execute();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Failed to log search click event: ${message}`);
    }
  }

  /**
   * A query is "successful" if the same user clicked any search result for the
   * same normalized query within SEARCH_CLICK_WINDOW_SECONDS. Queries that
   * returned zero results are excluded from the denominator (we can't expect a
   * click on an empty result set, and counting them would conflate "user gave
   * up" with "no content existed").
   */
  async computeWorkspaceSuccess(args: {
    workspaceId: string;
    days?: number;
    now?: Date;
  }): Promise<WorkspaceSearchSuccess> {
    const days = args.days ?? SEARCH_SUCCESS_WINDOW_DAYS;
    const now = args.now ?? new Date();
    const since = new Date(now.getTime() - days * 86_400_000);
    const windowSeconds = SEARCH_CLICK_WINDOW_SECONDS;

    const row = await this.db
      .selectFrom('searchEvents as q')
      .select((eb) => [
        eb.fn.countAll<string>().as('total'),
        sql<string>`count(*) filter (where exists (
          select 1 from search_events c
          where c.event_type = 'click'
            and c.workspace_id = q.workspace_id
            and c.user_id is not distinct from q.user_id
            and c.query = q.query
            and c.created_at >= q.created_at
            and c.created_at <= q.created_at + (${windowSeconds} * interval '1 second')
        ))`.as('successful'),
      ])
      .where('q.workspaceId', '=', args.workspaceId)
      .where('q.eventType', '=', 'query')
      .where('q.createdAt', '>=', since)
      .where('q.resultCount', '>', 0)
      .executeTakeFirst();

    const total = Number(row?.total ?? 0);
    const successful = Number(row?.successful ?? 0);
    return {
      totalQueries: total,
      successfulQueries: successful,
      ratio: total === 0 ? null : successful / total,
    };
  }

  /**
   * Group recent query events by normalized text and return those that
   * never produced a click within the click-match window. Two categories
   * surface separately so admins can prioritise differently:
   *   - `no_results` — query returned zero results (missing content)
   *   - `no_click`   — results were returned but no one clicked
   *                    (wrong content, bad ranking, unfindable titles)
   * Categorisation per group: if every occurrence had zero results it's
   * `no_results`; otherwise we treat it as `no_click` (the query DID
   * surface results at least sometimes, and people still didn't engage).
   */
  async findFailedQueries(args: {
    workspaceId: string;
    days?: number;
    minOccurrences?: number;
    limit?: number;
  }): Promise<SearchGapsResult> {
    const days = clamp(
      args.days ?? SEARCH_GAPS_DEFAULT_DAYS,
      1,
      SEARCH_GAPS_MAX_DAYS,
    );
    const minOccurrences = Math.max(
      1,
      args.minOccurrences ?? SEARCH_GAPS_DEFAULT_MIN_OCCURRENCES,
    );
    const limit = clamp(
      args.limit ?? SEARCH_GAPS_DEFAULT_LIMIT,
      1,
      SEARCH_GAPS_MAX_LIMIT,
    );
    const since = new Date(Date.now() - days * 86_400_000);
    const windowSeconds = SEARCH_CLICK_WINDOW_SECONDS;

    const totalRow = await this.db
      .selectFrom('searchEvents')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .where('workspaceId', '=', args.workspaceId)
      .where('eventType', '=', 'query')
      .where('createdAt', '>=', since)
      .executeTakeFirst();
    const totalQueries = Number(totalRow?.total ?? 0);
    if (totalQueries === 0) {
      return { items: [], rangeDays: days, totalQueries: 0 };
    }

    // For each query event, mark it "had a click" if a matching click event
    // by the same user landed within the success window. Then group by the
    // normalized query and keep only groups where NO occurrence was clicked.
    // CamelCasePlugin maps the snake_case aliases to camelCase keys.
    const rows = await sql<{
      query: string;
      occurrences: string;
      uniqueAskers: string;
      lastAskedAt: Date;
      avgResultCount: string;
      maxResultCount: string;
    }>`
      WITH query_events AS (
        SELECT
          q.query,
          q.user_id,
          q.created_at,
          q.result_count,
          EXISTS (
            SELECT 1 FROM search_events c
            WHERE c.event_type = 'click'
              AND c.workspace_id = q.workspace_id
              AND c.user_id IS NOT DISTINCT FROM q.user_id
              AND c.query = q.query
              AND c.created_at >= q.created_at
              AND c.created_at <= q.created_at + (${windowSeconds} * interval '1 second')
          ) AS clicked
        FROM search_events q
        WHERE q.workspace_id = ${args.workspaceId}
          AND q.event_type = 'query'
          AND q.created_at >= ${since}
      )
      SELECT
        query,
        count(*) AS occurrences,
        count(DISTINCT user_id) AS unique_askers,
        max(created_at) AS last_asked_at,
        avg(coalesce(result_count, 0))::float AS avg_result_count,
        max(coalesce(result_count, 0)) AS max_result_count
      FROM query_events
      GROUP BY query
      HAVING bool_and(clicked = false) AND count(*) >= ${minOccurrences}
      ORDER BY count(*) DESC, max(created_at) DESC
      LIMIT ${limit}
    `.execute(this.db);

    const items: SearchGapItem[] = rows.rows.map((r) => {
      const maxResults = Number(r.maxResultCount);
      const category: SearchGapCategory =
        maxResults === 0 ? 'no_results' : 'no_click';
      return {
        query: r.query,
        category,
        occurrences: Number(r.occurrences),
        uniqueAskers: Number(r.uniqueAskers),
        lastAskedAt:
          r.lastAskedAt instanceof Date
            ? r.lastAskedAt.toISOString()
            : new Date(r.lastAskedAt).toISOString(),
        avgResultCount: Number(r.avgResultCount),
      };
    });

    return { items, rangeDays: days, totalQueries };
  }

  async pruneOldEvents(
    days: number = SEARCH_EVENT_RETENTION_DAYS,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await this.db
      .deleteFrom('searchEvents')
      .where('createdAt', '<', cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
