import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { jsonToText } from '../../../../collaboration/collaboration.util';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

const MAX_CONTENT_CHARS = 8000;

@Injectable()
export class GetPageTool implements ChatTool, OnModuleInit {
  readonly name = 'get_page';
  readonly description =
    'Get the full content of a specific ConqrHub page. Accepts either the page UUID or the short slugId (e.g. "69mCnVW2Xg"). Use after search_pages or list_pages to read the actual page text. Returns up to 8000 characters.';
  readonly parameters = z.object({
    pageId: z
      .string()
      .min(1)
      .describe(
        'The page UUID or short slugId (both returned by search_pages and list_pages).',
      ),
  });

  constructor(
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    title: string | null;
    slugId: string;
    spaceId: string;
    content: string;
    updatedAt: string;
  }> {
    const page = await this.pageService.findById(args.pageId, true);
    if (!page || page.workspaceId !== ctx.workspaceId) {
      throw new NotFoundException(
        `Page not found for id "${args.pageId}". Pass either the page UUID or the short slugId returned by search_pages / list_pages.`,
      );
    }

    let ability;
    try {
      ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    } catch {
      throw new ForbiddenException('You do not have access to this page');
    }
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page');
    }

    const raw = page.content as any;
    let text = '';
    try {
      text = raw ? (jsonToText(raw) ?? '') : '';
    } catch {
      text = '';
    }
    text = text.slice(0, MAX_CONTENT_CHARS);

    return {
      id: page.id ?? '',
      title: page.title ?? null,
      slugId: page.slugId ?? '',
      spaceId: page.spaceId ?? '',
      content: text || '(empty page)',
      updatedAt: (page.updatedAt as any)?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}
