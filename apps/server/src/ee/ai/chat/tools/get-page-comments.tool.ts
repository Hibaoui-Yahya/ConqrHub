import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { CommentService } from '../../../../core/comment/comment.service';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { jsonToText } from '../../../../collaboration/collaboration.util';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class GetPageCommentsTool implements ChatTool, OnModuleInit {
  readonly name = 'get_page_comments';
  readonly description =
    'Get the comments posted on a ConqrHub page. Useful for understanding discussions, feedback, or open questions on a page.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20)
      .describe('Maximum number of comments to return'),
  });

  constructor(
    private readonly commentService: CommentService,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { pageId: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    text: string;
    type: string | null;
    creatorId: string;
    createdAt: Date;
  }[]> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page');
    }

    const { items } = await this.commentService.findByPageId(args.pageId, {
      limit: args.limit ?? 20,
    } as any);

    return items.map((c: any) => ({
      id: c.id,
      text: c.content ? jsonToText(c.content).slice(0, 500) : '',
      type: c.type ?? null,
      creatorId: c.creatorId,
      createdAt: c.createdAt,
    }));
  }
}
