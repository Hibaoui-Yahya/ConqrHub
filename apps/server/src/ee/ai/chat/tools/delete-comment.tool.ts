import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { PageService } from '../../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class DeleteCommentTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_comment';
  readonly description =
    'Delete a comment on a ConqrHub page. The comment creator can always delete their own comment; space admins can delete any comment in their space. Only use when the user explicitly asks to delete a comment.';
  readonly parameters = z.object({
    commentId: z.string().describe('The UUID of the comment to delete'),
  });

  constructor(
    private readonly commentRepo: CommentRepo,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { commentId: string },
    ctx: ChatToolContext,
  ): Promise<{ success: true; commentId: string }> {
    const comment = await this.commentRepo.findById(args.commentId);
    if (!comment) throw new NotFoundException('Comment not found');

    const page = await this.pageService.findById(comment.pageId);
    if (!page) throw new NotFoundException('Page not found');

    const isOwner = comment.creatorId === ctx.user.id;
    if (!isOwner) {
      const ability = await this.spaceAbility.createForUser(
        ctx.user,
        comment.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException('You can only delete your own comments');
      }
    }

    await this.commentRepo.deleteComment(comment.id);
    return { success: true, commentId: args.commentId };
  }
}
