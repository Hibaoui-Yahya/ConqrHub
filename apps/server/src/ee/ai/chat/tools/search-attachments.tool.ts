import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';

/** Candidates read before access filtering (results are then cut to limit). */
const MAX_CANDIDATES = 200;

@Injectable()
export class SearchAttachmentsTool implements ChatTool, OnModuleInit {
  readonly name = 'search_attachments';
  readonly description =
    'Search for file attachments across the workspace by file name, page ID, or space ID. Returns matching attachments with their metadata.';
  readonly parameters = z.object({
    query: z
      .string()
      .optional()
      .describe('Search term to match against file names'),
    pageId: z
      .string()
      .optional()
      .describe('Filter attachments by page UUID'),
    spaceId: z
      .string()
      .optional()
      .describe('Filter attachments by space UUID'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of results'),
  });

  private readonly logger = new Logger(SearchAttachmentsTool.name);

  constructor(
    private readonly registry: ChatToolRegistry,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMembers: SpaceMemberRepo,
    private readonly pagePermissions: PagePermissionRepo,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: {
      query?: string;
      pageId?: string;
      spaceId?: string;
      limit?: number;
    },
    ctx: ChatToolContext,
  ): Promise<
    {
      id: string;
      fileName: string;
      fileExt: string | null;
      mimeType: string | null;
      fileSize: string | null;
      pageId: string | null;
      spaceId: string | null;
      createdAt: string;
    }[]
  > {
    // File names can name candidates, salaries or clients: only files of
    // live pages the reader can open NOW are listed — a space they are a
    // member of, and the page's own restrictions (inherited ones included).
    // Files not attached to a page (avatars, covers, chat files) are never
    // listed. Any failure lists nothing (fail closed).
    const userId = ctx.user?.id;
    if (!userId) return [];
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    let attachments: Array<{
      id: string;
      fileName: string | null;
      fileExt: string | null;
      mimeType: string | null;
      fileSize: string | number | bigint | null;
      pageId: string | null;
      spaceId: string | null;
      createdAt: Date;
    }>;
    try {
      const spaceIds = await this.spaceMembers.getUserSpaceIds(userId);
      if (spaceIds.length === 0) return [];
      let q = this.db
        .selectFrom('attachments as a')
        .innerJoin('pages as p', 'p.id', 'a.pageId')
        .select([
          'a.id as id',
          'a.fileName as fileName',
          'a.fileExt as fileExt',
          'a.mimeType as mimeType',
          'a.fileSize as fileSize',
          'a.pageId as pageId',
          'p.spaceId as spaceId',
          'a.createdAt as createdAt',
        ])
        .where('a.workspaceId', '=', ctx.workspaceId)
        .where('p.workspaceId', '=', ctx.workspaceId)
        .where('a.deletedAt', 'is', null)
        .where('p.deletedAt', 'is', null)
        // The page's CURRENT space, not the one stored on the attachment.
        .where('p.spaceId', 'in', spaceIds);

      if (args.query) {
        // "%" and "_" in a file name are literal, not wildcards.
        const literal = args.query.replace(/[\\%_]/g, (c) => `\\${c}`);
        q = q.where('a.fileName', 'ilike', `%${literal}%`);
      }
      if (args.pageId) q = q.where('a.pageId', '=', args.pageId);
      if (args.spaceId) q = q.where('p.spaceId', '=', args.spaceId);

      const candidates = await q
        .orderBy('a.createdAt', 'desc')
        .limit(MAX_CANDIDATES)
        .execute();
      const pageIds = [...new Set(candidates.map((a) => a.pageId as string))];
      const open = new Set(
        pageIds.length
          ? await this.pagePermissions.filterAccessiblePageIds({ pageIds, userId })
          : [],
      );
      attachments = candidates
        .filter((a) => a.pageId && open.has(a.pageId))
        .slice(0, limit);
    } catch (err) {
      this.logger.error(
        `search_attachments access check failed, nothing listed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }

    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName ?? 'Untitled',
      fileExt: a.fileExt ?? null,
      mimeType: a.mimeType ?? null,
      fileSize: a.fileSize == null ? null : String(a.fileSize),
      pageId: a.pageId ?? null,
      spaceId: a.spaceId ?? null,
      createdAt: a.createdAt?.toISOString?.() ?? new Date().toISOString(),
    }));
  }
}
