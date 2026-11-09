import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';

/** Rows read before the page-permission filter cuts them down. */
const MAX_CANDIDATES = 200;
/** Extracted text that takes part in matching and excerpts, per file. */
const TEXT_WINDOW = 200_000;

export interface AttachmentSearchItem {
  id: string;
  fileName: string;
  fileExt: string | null;
  mimeType: string | null;
  pageId: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  rank: number;
  highlight: string;
  space: { id: string; name: string; slug: string; icon: string | null };
  page: { id: string; title: string | null; slugId: string };
}

/**
 * Search files attached to pages, by file name and by the text extracted
 * from them (`attachments.text_content`, filled by the attachment
 * extraction pipeline). Only files of live pages the reader can open now
 * are returned: a space they belong to, then the page's own restrictions.
 */
@Injectable()
export class AttachmentSearchService {
  private readonly logger = new Logger(AttachmentSearchService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  async search(
    params: { query: string; spaceId?: string; limit?: number; offset?: number },
    opts: { userId: string; workspaceId: string },
  ): Promise<{ items: AttachmentSearchItem[] }> {
    const query = (params.query ?? '').trim().slice(0, 200);
    if (!query) return { items: [] };

    const limit = Math.min(Math.max(params.limit ?? 25, 1), 50);
    const offset = Math.max(params.offset ?? 0, 0);

    const spaceIds = params.spaceId
      ? [params.spaceId]
      : await this.spaceMemberRepo.getUserSpaceIds(opts.userId);
    if (spaceIds.length === 0) return { items: [] };

    // "%" and "_" typed by the reader are literal characters.
    const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const text = sql`left(coalesce(a.text_content, ''), ${TEXT_WINDOW})`;
    const tsQuery = sql`plainto_tsquery('simple', f_unaccent(${query}))`;
    const tsVector = sql`to_tsvector('simple', f_unaccent(${text}))`;
    const nameMatch = sql<boolean>`f_unaccent(a.file_name) ilike f_unaccent(${pattern})`;

    const rows = await this.db
      .selectFrom('attachments as a')
      .innerJoin('pages as p', 'p.id', 'a.pageId')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .select([
        'a.id as id',
        'a.fileName as fileName',
        'a.fileExt as fileExt',
        'a.mimeType as mimeType',
        'a.pageId as pageId',
        'a.creatorId as creatorId',
        'a.createdAt as createdAt',
        'a.updatedAt as updatedAt',
        'p.title as pageTitle',
        'p.slugId as pageSlugId',
        's.id as spaceId',
        's.name as spaceName',
        's.slug as spaceSlug',
        's.logo as spaceLogo',
        sql<number>`(case when ${nameMatch} then 1 else 0 end) + ts_rank(${tsVector}, ${tsQuery})`.as(
          'rank',
        ),
        sql<string>`case when a.text_content is null then ''
          else ts_headline('simple', ${text}, ${tsQuery}, 'MinWords=8, MaxWords=16, MaxFragments=2') end`.as(
          'highlight',
        ),
      ])
      .where('a.workspaceId', '=', opts.workspaceId)
      .where('p.workspaceId', '=', opts.workspaceId)
      .where('a.deletedAt', 'is', null)
      .where('p.deletedAt', 'is', null)
      // The page's current space, not the one stored on the attachment.
      .where('p.spaceId', 'in', spaceIds)
      .where((eb) =>
        eb.or([
          eb(nameMatch, '=', true),
          eb.and([
            eb('a.textContent', 'is not', null),
            eb(sql<boolean>`${tsVector} @@ ${tsQuery}`, '=', true),
          ]),
        ]),
      )
      .orderBy('rank', 'desc')
      .orderBy('a.createdAt', 'desc')
      .limit(MAX_CANDIDATES)
      .execute();

    if (rows.length === 0) return { items: [] };

    const pageIds = [...new Set(rows.map((r) => r.pageId as string))];
    let open: Set<string>;
    try {
      open = new Set(
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId: opts.userId,
        }),
      );
    } catch (err) {
      // Fail closed: a file name can be as sensitive as the page.
      this.logger.error(
        `attachment search access check failed: ${(err as Error)?.message}`,
      );
      return { items: [] };
    }

    const items = rows
      .filter((r) => r.pageId && open.has(r.pageId))
      .slice(offset, offset + limit)
      .map(
        (r): AttachmentSearchItem => ({
          id: r.id,
          fileName: r.fileName,
          fileExt: r.fileExt ?? null,
          mimeType: r.mimeType ?? null,
          pageId: r.pageId,
          creatorId: r.creatorId,
          createdAt: r.createdAt as Date,
          updatedAt: r.updatedAt as Date,
          rank: Number(r.rank) || 0,
          highlight: r.highlight ?? '',
          space: {
            id: r.spaceId,
            name: r.spaceName,
            slug: r.spaceSlug,
            icon: r.spaceLogo ?? null,
          },
          page: { id: r.pageId, title: r.pageTitle, slugId: r.pageSlugId },
        }),
      );

    return { items };
  }
}
