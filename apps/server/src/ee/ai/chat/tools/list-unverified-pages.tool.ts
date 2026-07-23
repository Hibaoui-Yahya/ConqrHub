import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PageVerificationService } from '../../../page-verification/page-verification.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class ListUnverifiedPagesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_unverified_pages';
  readonly description =
    'List pages that are NOT verified and therefore invisible to rag_retrieve / Ask HR. Use this to find what needs verifying before it can be retrieved. Optionally scope to one space.';
  readonly parameters = z.object({
    spaceId: z.string().optional().describe('Optional space ID to scope to.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Max pages to return (default 50).'),
  });

  constructor(
    private readonly verification: PageVerificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { spaceId?: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<{
    pages: Array<{
      id: string;
      title: string | null;
      spaceId: string;
      status: string;
    }>;
    count: number;
  }> {
    const limit = args.limit ?? 50;

    let spaceIds: string[];
    if (args.spaceId) {
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
      spaceIds = [args.spaceId];
    } else {
      spaceIds = await this.spaceMemberRepo.getUserSpaceIds(ctx.user.id);
      if (spaceIds.length === 0) return { pages: [], count: 0 };
    }

    const pages = await this.verification.listUnverifiedPages(
      ctx.workspaceId,
      spaceIds,
      limit,
    );
    return { pages, count: pages.length };
  }
}
