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
export class UpdateCommentTool implements ChatTool, OnModuleInit {
  readonly name = 'update_comment';
  readonly description =
    'Update the content of an existing comment. Only the comment\'s creator can edit it. Provide plain text content.';
  readonly parameters = z.object({
    commentId: z.string().describe('The UUID of the comment to update'),
    text: z.string().describe('The new plain-text content for the comment'),
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
    args: { commentId: string; text: string },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    updatedAt: string;
  }> {
    const comment = await this.commentService.findById(
      args.commentId,
      ctx.workspaceId,
    );

    const pmContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: args.text }],
        },
      ],
    };

    const updated = await this.commentService.update(
      comment,
      { commentId: args.commentId, content: JSON.stringify(pmContent) } as any,
      ctx.user as any,
    );

    return {
      id: updated.id,
      updatedAt: updated.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}
