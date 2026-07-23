import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../../../integrations/storage/storage.service';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import {
  ChatTool,
  ChatToolContext,
  McpContentBlock,
  McpContentResult,
} from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { rasterizeSvgToPng } from './svg-raster.util';

const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ReadPageMediaTool implements ChatTool, OnModuleInit {
  readonly name = 'read_page_media';
  readonly description =
    'Return the images and drawings (Excalidraw/Drawio renders) embedded in a ConqrHub page as viewable images, so you can look at the page visually — diagrams, screenshots, charts, whiteboards. ' +
    `Loads up to ${MAX_IMAGES} images. Use get_page for the text; use this to SEE the visuals.`;

  readonly parameters = z.object({
    pageId: z
      .string()
      .min(1)
      .describe('The page UUID or short slugId.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_IMAGES)
      .optional()
      .default(MAX_IMAGES)
      .describe(`Max images to load (<= ${MAX_IMAGES}).`),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storage: StorageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<McpContentResult> {
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

    const limit = Math.min(args.limit ?? MAX_IMAGES, MAX_IMAGES);
    const rows = await this.db
      .selectFrom('attachments')
      .select(['id', 'fileName', 'filePath', 'mimeType', 'fileSize'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('pageId', '=', page.id)
      .where('deletedAt', 'is', null)
      .where('mimeType', 'like', 'image/%')
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .execute();

    if (rows.length === 0) {
      return {
        __mcpContent: [
          { type: 'text', text: `Page "${page.title ?? page.slugId}" has no embedded images or drawings.` },
        ],
      };
    }

    const blocks: McpContentBlock[] = [];
    const loaded: string[] = [];
    const skipped: string[] = [];
    for (const a of rows) {
      const size = a.fileSize ? Number(a.fileSize) : 0;
      const mime = a.mimeType ?? 'image/png';
      if (size > MAX_IMAGE_BYTES) {
        skipped.push(`${a.fileName} (too large)`);
        continue;
      }
      try {
        const buf = await this.storage.read(a.filePath);
        // SVG (incl. Excalidraw/Drawio renders): rasterise to PNG so it's a
        // real viewable image. Fall back to skipping if rasterisation fails.
        if (mime === 'image/svg+xml') {
          const png = await rasterizeSvgToPng(buf, { maxWidth: 1400 });
          if (png) {
            blocks.push({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' });
            loaded.push(`${a.fileName ?? a.id} (drawing)`);
          } else {
            skipped.push(`${a.fileName} (SVG — read_attachment id=${a.id} for source)`);
          }
          continue;
        }
        blocks.push({ type: 'image', data: buf.toString('base64'), mimeType: mime });
        loaded.push(a.fileName ?? a.id);
      } catch {
        skipped.push(`${a.fileName} (read failed)`);
      }
    }

    blocks.unshift({
      type: 'text',
      text:
        `${loaded.length} image(s) from "${page.title ?? page.slugId}": ${loaded.join(', ') || 'none'}.` +
        (skipped.length ? ` Skipped: ${skipped.join(', ')}.` : ''),
    });

    return { __mcpContent: blocks };
  }
}
