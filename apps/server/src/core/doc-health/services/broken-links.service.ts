import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  LinkCheckerService,
  LinkCheckResult,
} from './link-checker.service';

export type BrokenLinkKind = 'internal' | 'external';
export type BrokenLinkReason =
  | 'page_not_found'
  | 'space_not_found'
  | 'http_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'dns'
  | 'unknown';

type ExtractedLink = {
  href: string;
  kind: BrokenLinkKind;
};

type PageRow = {
  id: string;
  workspaceId: string;
  spaceId: string;
  content: unknown;
};

@Injectable()
export class BrokenLinksService {
  private readonly logger = new Logger(BrokenLinksService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly linkChecker: LinkCheckerService,
  ) {}

  /**
   * Walk a ProseMirror document and return every link href, classified as
   * internal (relative paths the wiki renders) or external (absolute URLs).
   * Pure — easy to unit-test without a database.
   */
  static extractLinks(content: unknown): ExtractedLink[] {
    const out: ExtractedLink[] = [];
    const seen = new Set<string>();

    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;

      // Tiptap link mark on a text node
      if (Array.isArray(node.marks)) {
        for (const mark of node.marks) {
          if (
            mark?.type === 'link' &&
            typeof mark?.attrs?.href === 'string' &&
            mark.attrs.href.length > 0
          ) {
            push(mark.attrs.href);
          }
        }
      }

      // Mention nodes (entityId-based, not href-based) are tracked via the
      // backlinks pipeline, not here. We only chase href-style links so
      // broken-link detection stays orthogonal to the mention system.

      if (Array.isArray(node.content)) {
        for (const child of node.content) visit(child);
      }
    };

    const push = (href: string) => {
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ href, kind: classify(href) });
    };

    visit(content);
    return out;
  }

  /**
   * Scan one page: extract links, validate internal links against the pages
   * table, replace this page's broken_links rows with the current state.
   * External links are captured but not network-checked in v1.2 — that
   * lands in v1.3 once the HTTP fetcher and air-gapped opt-out exist.
   */
  async scanPage(args: {
    pageId: string;
    workspaceId: string;
    spaceId: string;
    content: unknown;
    now?: Date;
    /**
     * Optional pre-computed external link check results, keyed by URL.
     * Populated by `scanWorkspace` so we batch-check unique URLs once
     * across the workspace instead of N times per page.
     */
    externalResults?: Map<string, LinkCheckResult>;
  }): Promise<{
    extracted: number;
    broken: number;
  }> {
    const now = args.now ?? new Date();
    const links = BrokenLinksService.extractLinks(args.content);

    const internalSlugIds = links
      .filter((l) => l.kind === 'internal')
      .map((l) => extractSlugId(l.href))
      .filter((id): id is string => id !== null);

    const existingPages =
      internalSlugIds.length > 0
        ? await this.db
            .selectFrom('pages')
            .select(['slugId'])
            .where('slugId', 'in', internalSlugIds)
            .where('workspaceId', '=', args.workspaceId)
            .where('deletedAt', 'is', null)
            .execute()
        : [];

    const validSlugIds = new Set(existingPages.map((p) => p.slugId));

    const brokenRows: Array<{
      pageId: string;
      workspaceId: string;
      spaceId: string;
      targetUrl: string;
      kind: BrokenLinkKind;
      httpStatus: number | null;
      reason: BrokenLinkReason;
      lastCheckedAt: Date;
    }> = [];

    for (const link of links) {
      if (link.kind === 'internal') {
        const slugId = extractSlugId(link.href);
        if (!slugId) continue;
        if (validSlugIds.has(slugId)) continue;

        brokenRows.push({
          pageId: args.pageId,
          workspaceId: args.workspaceId,
          spaceId: args.spaceId,
          targetUrl: link.href,
          kind: 'internal',
          httpStatus: null,
          reason: 'page_not_found',
          lastCheckedAt: now,
        });
      } else {
        // External: only flagged when we actually checked it AND the check
        // came back not-ok. Without externalResults (e.g., scanPage called
        // directly outside a workspace scan, or external checks disabled),
        // we silently skip — better than false-flagging links we couldn't
        // verify.
        const result = args.externalResults?.get(link.href);
        if (!result) continue;
        if (result.ok === true) continue;

        brokenRows.push({
          pageId: args.pageId,
          workspaceId: args.workspaceId,
          spaceId: args.spaceId,
          targetUrl: link.href,
          kind: 'external',
          httpStatus: result.httpStatus,
          reason: result.reason,
          lastCheckedAt: now,
        });
      }
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('pageBrokenLinks')
        .where('pageId', '=', args.pageId)
        .execute();
      if (brokenRows.length > 0) {
        await trx
          .insertInto('pageBrokenLinks')
          .values(brokenRows)
          .execute();
      }
    });

    return { extracted: links.length, broken: brokenRows.length };
  }

  async scanWorkspace(workspaceId: string): Promise<{
    pagesScanned: number;
    pagesBroken: number;
    failed: number;
    externalsChecked: number;
  }> {
    const pages = (await this.db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'spaceId', 'content'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute()) as unknown as PageRow[];

    // Phase 1: collect all unique external URLs across the workspace so we
    // can batch-check them once, even if 100 pages link to the same URL.
    let externalResults: Map<string, LinkCheckResult> | undefined;
    let externalsChecked = 0;

    if (this.linkChecker.isEnabled()) {
      const externalUrls = new Set<string>();
      for (const p of pages) {
        try {
          const links = BrokenLinksService.extractLinks(p.content);
          for (const l of links) {
            if (l.kind === 'external') externalUrls.add(l.href);
          }
        } catch (err) {
          // Don't let one malformed page block the whole batch.
          const message =
            err instanceof Error ? err.message : 'Unknown error';
          this.logger.warn(
            `Failed to extract links from page ${p.id}: ${message}`,
          );
        }
      }

      if (externalUrls.size > 0) {
        externalResults = await this.linkChecker.checkBatch([
          ...externalUrls,
        ]);
        externalsChecked = externalUrls.size;
      }
    }

    // Phase 2: per-page, validate internal slugs and pair external links
    // with the batch-check results. Per-page failures don't stop the run.
    let pagesScanned = 0;
    let pagesBroken = 0;
    let failed = 0;
    for (const p of pages) {
      try {
        const result = await this.scanPage({
          pageId: p.id,
          workspaceId: p.workspaceId,
          spaceId: p.spaceId,
          content: p.content,
          externalResults,
        });
        pagesScanned += 1;
        if (result.broken > 0) pagesBroken += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Failed to scan page ${p.id}: ${message}`);
      }
    }
    return { pagesScanned, pagesBroken, failed, externalsChecked };
  }

  async scanAll(): Promise<{
    workspaces: number;
    pagesScanned: number;
    pagesBroken: number;
  }> {
    const workspaces = await this.db
      .selectFrom('workspaces')
      .select('id')
      .where('deletedAt', 'is', null)
      .execute();

    let pagesScanned = 0;
    let pagesBroken = 0;
    for (const w of workspaces) {
      try {
        const result = await this.scanWorkspace(w.id);
        pagesScanned += result.pagesScanned;
        pagesBroken += result.pagesBroken;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to scan workspace ${w.id} for broken links: ${message}`,
        );
      }
    }
    return { workspaces: workspaces.length, pagesScanned, pagesBroken };
  }
}

function classify(href: string): BrokenLinkKind {
  // Internal: relative path or same-origin path. We classify by shape, not
  // hostname — production deployments have multiple hostnames (per-workspace
  // subdomains, custom domains) and the scanner can't reliably enumerate them.
  if (
    href.startsWith('/') &&
    !href.startsWith('//') // protocol-relative URLs are external
  ) {
    return 'internal';
  }
  return 'external';
}

/**
 * Match the page-route shape used across the app:
 *   /s/<spaceSlug>/p/<slugId>(-<title>)?
 *   /p/<slugId>(-<title>)?
 * The slugId is a 10-character nanoid (lowercase alphanumeric).
 */
const SLUG_RE = /\/p\/([a-z0-9]{10})(?:[-/?#]|$)/i;

function extractSlugId(href: string): string | null {
  const m = SLUG_RE.exec(href);
  if (!m) return null;
  return m[1].toLowerCase();
}
