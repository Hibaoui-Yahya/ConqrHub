import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { z } from 'zod';
import { SpaceService } from '../../../../core/space/services/space.service';
import { SpaceMemberService } from '../../../../core/space/services/space-member.service';
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
    private readonly spaceMemberService: SpaceMemberService,
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
    createdAt: string;
    memberCount: number | null;
    hasMoreMembers: boolean;
    members: { id: string; name: string | null; role: string | null }[];
  }> {
    const space = await this.spaceService.getSpaceInfo(args.spaceId, ctx.workspaceId);
    if (!space) throw new NotFoundException('Space not found');

    let ability;
    try {
      ability = await this.spaceAbility.createForUser(ctx.user, args.spaceId);
    } catch {
      throw new ForbiddenException(
        `You do not have access to space ${args.spaceId}`,
      );
    }
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        `You do not have access to space ${args.spaceId}`,
      );
    }

    // The member count is what distinguishes this tool from get_space. It
    // was promised in the description but never returned, which made the two
    // tools byte-identical and one of them pointless. Membership is a
    // separate read and a caller without permission for it still deserves
    // the space metadata, so a refusal here degrades to null rather than
    // failing the whole call.
    let memberCount: number | null = null;
    let hasMoreMembers = false;
    let members: { id: string; name: string | null; role: string | null }[] = [];
    if (ability.can(SpaceCaslAction.Read, SpaceCaslSubject.Member)) {
      try {
        const page = await this.spaceMemberService.getSpaceMembers(
          args.spaceId,
          ctx.workspaceId,
          { limit: 100, page: 1 } as any,
        );
        const items = page?.items ?? [];
        // The paginator reports no total, so this is the number actually
        // read. hasMoreMembers says when that is a floor rather than the
        // whole membership — reporting a page size as a total would be a
        // confident wrong number.
        memberCount = items.length;
        hasMoreMembers = page?.meta?.hasNextPage ?? false;
        members = items.map((m: any) => ({
          id: m.userId ?? m.groupId ?? m.id,
          name: m.name ?? m.displayName ?? m.email ?? null,
          role: m.role ?? null,
        }));
      } catch {
        memberCount = null;
      }
    }

    return {
      id: space.id,
      name: space.name ?? 'Untitled',
      slug: space.slug,
      description: (space as any).description ?? null,
      createdAt: space.createdAt?.toISOString?.() ?? new Date().toISOString(),
      memberCount,
      hasMoreMembers,
      members,
    };
  }
}
