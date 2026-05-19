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

@Injectable()
export class UpdateSpaceTool implements ChatTool, OnModuleInit {
  readonly name = 'update_space';
  readonly description =
    'Update an existing space\'s name, description, or settings. Requires admin or space-admin permission.';
  readonly parameters = z.object({
    spaceId: z.string().describe('The UUID of the space to update'),
    name: z.string().min(2).max(100).optional().describe('The new name for the space'),
    description: z.string().optional().describe('The new description for the space'),
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
    args: { spaceId: string; name?: string; description?: string },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    updatedAt: string;
  }> {
    const space = await this.spaceService.getSpaceInfo(args.spaceId, ctx.workspaceId);
    if (!space) throw new NotFoundException('Space not found');

    const ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException(
        'You do not have permission to update this space',
      );
    }

    const updated = await this.spaceService.updateSpace(
      { spaceId: args.spaceId, name: args.name, description: args.description } as any,
      ctx.workspaceId,
    );

    return {
      id: updated.id,
      name: updated.name ?? 'Untitled',
      slug: updated.slug,
      description: (updated as any).description ?? null,
      updatedAt: updated.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    };
  }
}
