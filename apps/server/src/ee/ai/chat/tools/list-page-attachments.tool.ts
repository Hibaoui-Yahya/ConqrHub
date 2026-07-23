import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListPageAttachmentsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_page_attachments';
  readonly description =
    'List the files, images, and drawings (Excalidraw/Drawio) attached to a specific ConqrHub page, with their ids, names and types. ' +
    'Use this to discover what media a page has, then read_attachment (or read_page_media for all images at once) to actually view/read them.';

  readonly parameters = z.object({
    pageId: z
      .string()
      .min(1)
      .describe('The page UUID or short slugId.'),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{
    pageId: string;
    count: number;
    attachments: Array<{
      id: string;
      fileName: string;
      mimeType: string | null;
      kind: 'image' | 'document' | 'drawing' | 'other';
      fileSize: number | null;
    }>;
  }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException(`Page not found for id "${args.pageId}".`);
    }
    let ability;
    try {
      ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    } catch {
      throw new ForbiddenException('You do not have access to this page.');
    }
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page.');
    }

    const rows = await this.db
      .selectFrom('attachments')
      .select(['id', 'fileName', 'mimeType', 'fileSize', 'type', 'fileExt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('pageId', '=', page.id)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .execute();

    return {
      pageId: page.id,
      count: rows.length,
      attachments: rows.map((a) => ({
        id: a.id,
        fileName: a.fileName ?? 'Untitled',
        mimeType: a.mimeType ?? null,
        kind: this.kindOf(a.mimeType, a.type, a.fileExt),
        fileSize: a.fileSize ? Number(a.fileSize) : null,
      })),
    };
  }

  private kindOf(
    mime: string | null,
    type: string | null,
    ext: string | null,
  ): 'image' | 'document' | 'drawing' | 'other' {
    const t = (type ?? '').toLowerCase();
    if (t.includes('excalidraw') || t.includes('drawio')) return 'drawing';
    if (mime?.startsWith('image/')) return 'image';
    const e = (ext ?? '').toLowerCase().replace(/^\./, '');
    if (
      mime === 'application/pdf' ||
      ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'md', 'csv'].includes(e)
    ) {
      return 'document';
    }
    return 'other';
  }
}
