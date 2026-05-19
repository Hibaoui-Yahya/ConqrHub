import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

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

  constructor(
    private readonly registry: ChatToolRegistry,
    @InjectKysely() private readonly db: KyselyDB,
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
    let q = this.db
      .selectFrom('attachments')
      .select([
        'id',
        'fileName',
        'fileExt',
        'mimeType',
        'fileSize',
        'pageId',
        'spaceId',
        'createdAt',
      ])
      .where('workspaceId', '=', ctx.workspaceId);

    if (args.query) {
      q = q.where('fileName', 'ilike', `%${args.query}%`);
    }

    if (args.pageId) {
      q = q.where('pageId', '=', args.pageId);
    }

    if (args.spaceId) {
      q = q.where('spaceId', '=', args.spaceId);
    }

    const attachments = await q
      .orderBy('createdAt', 'desc')
      .limit(args.limit ?? 20)
      .execute();

    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName ?? 'Untitled',
      fileExt: a.fileExt ?? null,
      mimeType: a.mimeType ?? null,
      fileSize: a.fileSize ?? null,
      pageId: a.pageId ?? null,
      spaceId: a.spaceId ?? null,
      createdAt: a.createdAt?.toISOString?.() ?? new Date().toISOString(),
    }));
  }
}
