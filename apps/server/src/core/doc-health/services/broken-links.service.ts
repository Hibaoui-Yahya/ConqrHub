import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

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

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

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
      if (link.kind !== 'internal') continue;
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
  }> {
    const pages = (await this.db
      .selectFrom('pages')
      .select(['id', 'workspaceId', 'spaceId', 'content'])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .execute()) as unknown as PageRow[];

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
        });
        pagesScanned += 1;
        if (result.broken > 0) pagesBroken += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`Failed to scan page ${p.id}: ${message}`);
      }
    }
    return { pagesScanned, pagesBroken, failed };
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
