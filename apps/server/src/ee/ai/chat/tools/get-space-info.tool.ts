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
export class GetSpaceInfoTool implements ChatTool, OnModuleInit {
  readonly name = 'get_space_info';
  readonly description =
    'Get metadata about a ConqrHub space: its name, slug, description, and member count.';
  readonly parameters = z.object({
    spaceId: z.string().describe('The UUID of the space'),
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
    args: { spaceId: string },
    ctx: ChatToolContext,
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: Date;
  }> {
    const ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        `You do not have access to space ${args.spaceId}`,
      );
    }

    const space = await this.spaceService.getSpaceInfo(args.spaceId, ctx.workspaceId);
    if (!space) throw new NotFoundException('Space not found');

    return {
      id: space.id,
      name: space.name,
      slug: space.slug,
      description: (space as any).description ?? null,
      createdAt: space.createdAt,
    };
  }
}
