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
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class CreateCommentTool implements ChatTool, OnModuleInit {
  readonly name = 'create_comment';
  readonly description =
    'Post a comment on a wiki page. Only use this when the user explicitly asks to leave, add, or post a comment.';
  readonly parameters = z.object({
    pageId: z.string().describe('The UUID of the page to comment on'),
    text: z.string().describe('The plain-text content of the comment'),
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
    args: { pageId: string; text: string },
    ctx: ChatToolContext,
  ): Promise<{ id: string; createdAt: Date }> {
    const page = await this.pageService.findById(args.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this page');
    }

    // Wrap plain text in a minimal ProseMirror document node.
    const pmContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: args.text }],
        },
      ],
    };

    const comment = await this.commentService.create(
      { page, workspaceId: ctx.workspaceId, user: ctx.user },
      {
        pageId: args.pageId,
        content: JSON.stringify(pmContent),
        type: 'page',
        selection: undefined,
        parentCommentId: undefined,
      } as any,
    );

    return { id: comment.id, createdAt: comment.createdAt };
  }
}
