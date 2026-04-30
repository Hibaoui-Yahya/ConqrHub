import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class CreatePageTool implements ChatTool, OnModuleInit {
  readonly name = 'create_page';
  readonly description =
    'Create a new wiki page in a space. Provide markdown content to populate it. Only use this when the user explicitly asks to create a page.';
  readonly parameters = z.object({
    spaceId: z.string().describe('The UUID of the space to create the page in'),
    title: z.string().describe('The page title'),
    content: z
      .string()
      .optional()
      .describe('Initial page content in markdown format'),
    parentPageId: z
      .string()
      .optional()
      .describe('Optional UUID of the parent page (creates a sub-page)'),
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
    args: { spaceId: string; title: string; content?: string; parentPageId?: string },
    ctx: ChatToolContext,
  ): Promise<{ id: string; title: string | null; slugId: string; spaceId: string }> {
    const ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        `You do not have permission to create pages in space ${args.spaceId}`,
      );
    }

    const page = await this.pageService.create(ctx.user.id, ctx.workspaceId, {
      spaceId: args.spaceId,
      title: args.title,
      parentPageId: args.parentPageId,
      content: args.content,
      format: args.content ? 'markdown' : undefined,
    } as any);

    return {
      id: page.id,
      title: page.title ?? null,
      slugId: page.slugId,
      spaceId: page.spaceId,
    };
  }
}
