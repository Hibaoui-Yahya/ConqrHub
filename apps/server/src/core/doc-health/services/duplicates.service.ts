import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

// Lexical similarity threshold (pg_trgm). Values above ~0.6 capture
// near-duplicate copy/paste pages while staying clear of merely-related
// pages with shared vocabulary. Tunable via env for ops who want to tighten
// or loosen the signal without redeploying.
export const DUPLICATE_DEFAULT_THRESHOLD = 0.6;
export const DUPLICATE_MIN_THRESHOLD = 0.3;
export const DUPLICATE_MAX_THRESHOLD = 0.95;

// Cap how much of each page's body we feed into similarity. Trigram
// similarity over very long bodies starts to converge on every-page-looks-
// somewhat-similar; a normalized excerpt keeps the signal sharp and the
// query cheap.
export const DUPLICATE_EXCERPT_CHARS = 1500;

// Each page is compared against at most this many candidates per scan. A
// hard cap keeps the cost predictable for very large workspaces — if a
// page has more near-duplicates than this, the worst-case extras roll over
// to the next scan once high-similarity rows are addressed.
export const DUPLICATE_MAX_PAIRS_PER_PAGE = 5;

// Hard limit on pairs returned per single space-scoped scan to keep the
// O(n²) pg_trgm cross-join bounded. Larger spaces produce a partial result
// — strongest pairs first, the long tail rolls over on the next run.
export const DUPLICATE_MAX_PAIRS_PER_SPACE_SCAN = 500;

@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  threshold(): number {
    const raw = process.env.DOC_HEALTH_DUPLICATE_THRESHOLD;
    if (!raw) return DUPLICATE_DEFAULT_THRESHOLD;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DUPLICATE_DEFAULT_THRESHOLD;
    return Math.min(
      DUPLICATE_MAX_THRESHOLD,
      Math.max(DUPLICATE_MIN_THRESHOLD, parsed),
    );
  }

  /**
   * Run the duplicate scan for a single space (the typical job unit).
   * Keeps the pg_trgm cross-join bounded to one space's pages and caps
   * the returned pair count.
   */
  async scanSpace(
    workspaceId: string,
    spaceId: string,
  ): Promise<{ pagesScanned: number; pairsFound: number }> {
    const threshold = this.threshold();

    const rows = await sql<{
      pageA: string;
      pageB: string;
      sim: number;
    }>`
      WITH excerpt AS (
        SELECT
          p.id,
          coalesce(p.title, '') || ' ' ||
          substring(coalesce(p.text_content, '') FROM 1 FOR ${DUPLICATE_EXCERPT_CHARS}) AS body
        FROM pages p
        WHERE p.workspace_id = ${workspaceId}
          AND p.space_id = ${spaceId}
          AND p.deleted_at IS NULL
      )
      SELECT
        a.id AS page_a,
        b.id AS page_b,
        similarity(a.body, b.body) AS sim
      FROM excerpt a
      JOIN excerpt b
        ON a.id < b.id
        AND a.body % b.body
      WHERE similarity(a.body, b.body) >= ${threshold}
      ORDER BY similarity(a.body, b.body) DESC
      LIMIT ${DUPLICATE_MAX_PAIRS_PER_SPACE_SCAN}
    `.execute(this.db);

    const now = new Date();

    type Pair = { pageId: string; otherId: string; sim: number };
    const pairsByPage = new Map<string, Pair[]>();
    for (const r of rows.rows) {
      const sim = Number(r.sim);
      pushPair(pairsByPage, r.pageA, r.pageB, sim);
      pushPair(pairsByPage, r.pageB, r.pageA, sim);
    }

    const inserts: Array<{
      workspaceId: string;
      pageId: string;
      duplicateOfPageId: string;
      similarity: number;
      detectedAt: Date;
    }> = [];

    for (const [pageId, pairs] of pairsByPage) {
      pairs.sort((a, b) => b.sim - a.sim);
      const top = pairs.slice(0, DUPLICATE_MAX_PAIRS_PER_PAGE);
      for (const p of top) {
        inserts.push({
          workspaceId,
          pageId,
          duplicateOfPageId: p.otherId,
          similarity: p.sim,
          detectedAt: now,
        });
      }
    }

    // Per-space replace — preserves rows for other spaces in the workspace.
    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('pageDuplicates')
        .where('workspaceId', '=', workspaceId)
        .where(
          'pageId',
          'in',
          trx
            .selectFrom('pages')
            .select('id')
            .where('spaceId', '=', spaceId)
            .where('deletedAt', 'is', null),
        )
        .execute();
      if (inserts.length > 0) {
        await trx.insertInto('pageDuplicates').values(inserts).execute();
      }
    });

    return {
      pagesScanned: pairsByPage.size,
      pairsFound: inserts.length,
    };
  }

  /**
   * Workspace-scoped wrapper that iterates over each space and runs the
   * bounded per-space scan. The previous implementation issued a single
   * pg_trgm cross-join across every page in the workspace (O(n²)), which
   * could lock a DB connection for seconds on workspaces with thousands of
   * pages. Per-space scoping bounds each scan to one space's footprint.
   */
  async scanWorkspace(workspaceId: string): Promise<{
    pagesScanned: number;
    pairsFound: number;
  }> {
    const spaces = await this.db
      .selectFrom('spaces')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute();

    let pagesScanned = 0;
    let pairsFound = 0;
    for (const s of spaces) {
      try {
        const r = await this.scanSpace(workspaceId, s.id);
        pagesScanned += r.pagesScanned;
        pairsFound += r.pairsFound;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed duplicate scan for workspace=${workspaceId} space=${s.id}: ${message}`,
        );
      }
    }
    return { pagesScanned, pairsFound };
  }

  async scanAll(): Promise<{
    workspaces: number;
    pagesScanned: number;
    pairsFound: number;
  }> {
    const workspaces = await this.db
      .selectFrom('workspaces')
      .select('id')
      .where('deletedAt', 'is', null)
      .execute();

    let pagesScanned = 0;
    let pairsFound = 0;
    for (const w of workspaces) {
      try {
        const result = await this.scanWorkspace(w.id);
        pagesScanned += result.pagesScanned;
        pairsFound += result.pairsFound;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to scan workspace ${w.id} for duplicates: ${message}`,
        );
      }
    }
    return { workspaces: workspaces.length, pagesScanned, pairsFound };
  }
}

function pushPair(
  map: Map<string, { pageId: string; otherId: string; sim: number }[]>,
  pageId: string,
  otherId: string,
  sim: number,
): void {
  const existing = map.get(pageId);
  const entry = { pageId, otherId, sim };
  if (existing) {
    existing.push(entry);
  } else {
    map.set(pageId, [entry]);
  }
}
