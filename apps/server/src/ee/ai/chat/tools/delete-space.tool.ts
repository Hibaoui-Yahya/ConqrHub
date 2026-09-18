import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { SpaceService } from '../../../../core/space/services/space.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

/**
 * Deleting a space removes everything inside it and, unlike delete_page,
 * there is no trash to recover from. The confirmation argument is deliberate:
 * an agent has to restate the slug it read back from the space, which it can
 * only do after looking the space up, so a hallucinated id cannot destroy the
 * wrong space. The check is on the slug rather than the id because the slug is
 * what a human recognises when they approve the call.
 */
@Injectable()
export class DeleteSpaceTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_space';
  readonly description =
    'Permanently delete a ConqrHub space and every page, comment and attachment inside it. There is NO trash and no undo — unlike delete_page, this cannot be recovered. Requires space-admin permission. You must pass confirmSlug matching the space\'s own slug, so look the space up with get_space first. Only use when the user has explicitly asked to delete this specific space.';
  readonly parameters = z.object({
    spaceId: z.string().describe('The UUID of the space to delete'),
    confirmSlug: z
      .string()
      .describe(
        "The space's slug, exactly as get_space reports it. Guards against deleting the wrong space.",
      ),
  });

  constructor(
    private readonly spaceService: SpaceService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { spaceId: string; confirmSlug: string },
    ctx: ChatToolContext,
  ): Promise<{ success: true; spaceId: string; slug: string; deleted: true }> {
    const space = await this.spaceService.getSpaceInfo(args.spaceId, ctx.workspaceId);
    if (!space) throw new NotFoundException('Space not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException(
        'You do not have permission to delete this space',
      );
    }

    const expected = (space.slug ?? '').trim().toLowerCase();
    if (args.confirmSlug.trim().toLowerCase() !== expected) {
      throw new ForbiddenException(
        `confirmSlug "${args.confirmSlug}" does not match the slug of space ${args.spaceId}. Read the space with get_space and pass its exact slug.`,
      );
    }

    await this.spaceService.deleteSpace(args.spaceId, ctx.workspaceId);

    return {
      success: true,
      spaceId: args.spaceId,
      slug: space.slug,
      deleted: true,
    };
  }
}
