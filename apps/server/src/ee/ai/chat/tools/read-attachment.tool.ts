import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
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
  McpContentResult,
} from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { rasterizeSvgToPng } from './svg-raster.util';

// Cap the raw bytes we inline into a chat message so a huge file can't blow up
// the response. ~7 MB of base64 ≈ 5 MB source.
const MAX_INLINE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;

@Injectable()
export class ReadAttachmentTool implements ChatTool, OnModuleInit {
  readonly name = 'read_attachment';
  readonly description =
    'Read a file/attachment from ConqrHub and return its content to the conversation so you can actually SEE or READ it. ' +
    'Images (png/jpg/gif/webp/svg) are returned as viewable image content you can analyse directly. ' +
    'Documents with extracted text (PDF, Word, etc. that ConqrHub has indexed) and plain-text/markdown/CSV/JSON files are returned as text. ' +
    'Excalidraw and Drawio drawings are stored as images and come back as viewable images. ' +
    'Find an attachment id with search_attachments or list_page_attachments. Files over 5 MB are summarised, not inlined.';

  readonly parameters = z.object({
    attachmentId: z
      .string()
      .min(1)
      .describe('The attachment UUID (from search_attachments / list_page_attachments).'),
  });

  constructor(
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storage: StorageService,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { attachmentId: string },
    ctx: ChatToolContext,
  ): Promise<McpContentResult> {
    const att = await this.attachmentRepo.findByIdWithContent(
      args.attachmentId,
      ctx.workspaceId,
    );
    if (!att) {
      throw new NotFoundException(
        `Attachment "${args.attachmentId}" not found in this workspace.`,
      );
    }

    await this.assertCanRead(att.spaceId, att.pageId, ctx);

    const mime = att.mimeType ?? 'application/octet-stream';
    const meta = {
      attachmentId: att.id,
      fileName: att.fileName,
      mimeType: mime,
      fileSize: att.fileSize ? Number(att.fileSize) : null,
      pageId: att.pageId ?? null,
      spaceId: att.spaceId ?? null,
    };
    const size = att.fileSize ? Number(att.fileSize) : 0;

    // 1a. SVG (incl. Excalidraw/Drawio renders): rasterise to PNG so the model
    // can actually SEE the drawing (vision APIs reject image/svg+xml). On any
    // rasterisation failure, fall through to returning the SVG source as text.
    if (mime === 'image/svg+xml' && size <= MAX_INLINE_BYTES) {
      const svg = await this.storage.read(att.filePath);
      const png = await rasterizeSvgToPng(svg, { maxWidth: 1400 });
      if (png) {
        return {
          __mcpContent: [
            { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          ],
          meta: { ...meta, renderedFrom: 'svg' },
        };
      }
      return {
        __mcpContent: [
          {
            type: 'text',
            text: `SVG source of "${att.fileName}" (could not rasterise; here is the markup):\n\n${svg.toString('utf8').slice(0, MAX_TEXT_CHARS)}`,
          },
        ],
        meta,
      };
    }

    // 1b. Raster images (and image-rendered drawings) -> viewable image block.
    if (mime.startsWith('image/') && mime !== 'image/svg+xml') {
      if (size > MAX_INLINE_BYTES) {
        return {
          __mcpContent: [
            {
              type: 'text',
              text: `Image "${att.fileName}" is ${(size / 1024 / 1024).toFixed(1)} MB — too large to inline. Open it in ConqrHub.`,
            },
          ],
          meta,
        };
      }
      const buf = await this.storage.read(att.filePath);
      return {
        __mcpContent: [
          { type: 'image', data: buf.toString('base64'), mimeType: mime },
        ],
        meta,
      };
    }

    // 2. Documents ConqrHub already extracted text for (search index).
    if (att.textContent && att.textContent.trim()) {
      return {
        __mcpContent: [
          {
            type: 'text',
            text: `Extracted text of "${att.fileName}":\n\n${att.textContent.slice(0, MAX_TEXT_CHARS)}`,
          },
        ],
        meta,
      };
    }

    // 3. Plain-text-family files -> decode inline.
    if (this.isTextLike(mime, att.fileExt)) {
      if (size > MAX_INLINE_BYTES) {
        return {
          __mcpContent: [
            { type: 'text', text: `"${att.fileName}" is too large to inline (${(size / 1024 / 1024).toFixed(1)} MB).` },
          ],
          meta,
        };
      }
      const buf = await this.storage.read(att.filePath);
      return {
        __mcpContent: [
          {
            type: 'text',
            text: `Contents of "${att.fileName}":\n\n${buf.toString('utf8').slice(0, MAX_TEXT_CHARS)}`,
          },
        ],
        meta,
      };
    }

    // 4. Binary with no extracted text.
    return {
      __mcpContent: [
        {
          type: 'text',
          text: `"${att.fileName}" (${mime}) has no inline-readable content. It may be a binary file, or a document ConqrHub hasn't indexed text for. Open it in ConqrHub to view.`,
        },
      ],
      meta,
    };
  }

  private isTextLike(mime: string, ext: string | null): boolean {
    if (mime.startsWith('text/')) return true;
    if (
      [
        'application/json',
        'application/xml',
        'application/x-yaml',
        'application/yaml',
        'image/svg+xml',
      ].includes(mime)
    ) {
      return true;
    }
    const e = (ext ?? '').toLowerCase().replace(/^\./, '');
    return ['md', 'markdown', 'txt', 'csv', 'json', 'yml', 'yaml', 'log', 'xml'].includes(e);
  }

  private async assertCanRead(
    spaceId: string | null,
    pageId: string | null,
    ctx: ChatToolContext,
  ): Promise<void> {
    let resolvedSpaceId = spaceId ?? null;
    if (!resolvedSpaceId && pageId) {
      const page = await this.pageService.findById(pageId, true);
      if (page && page.workspaceId === ctx.workspaceId) {
        resolvedSpaceId = page.spaceId ?? null;
      }
    }
    if (!resolvedSpaceId) {
      // Not tied to a space the caller can be authorised against (e.g. an
      // AI-chat/insight upload) — deny rather than leak.
      throw new ForbiddenException(
        'This attachment is not readable through the workspace knowledge tools.',
      );
    }
    let ability;
    try {
      ability = await this.spaceAbility.createForUser(ctx.user, resolvedSpaceId);
    } catch {
      throw new ForbiddenException('You do not have access to this attachment.');
    }
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this attachment.');
    }
  }
}
