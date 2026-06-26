import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { RagRetrievalService } from '../../rag/rag-retrieval.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

@Injectable()
export class RagRetrieveTool implements ChatTool, OnModuleInit {
  readonly name = 'rag_retrieve';
  readonly description =
    'Retrieve relevant knowledge from the ConqrHub knowledge base using semantic search. Use this when the user asks about specific content, asks for detailed information, or when general knowledge might not be sufficient. Returns context chunks with source labels.';
  readonly parameters = z.object({
    question: z
      .string()
      .describe('The question or topic to search for in the knowledge base'),
    spaceId: z
      .string()
      .optional()
      .describe(
        'Optional space ID to restrict the search to a specific space',
      ),
  });

  constructor(
    private readonly retrieval: RagRetrievalService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async execute(
    args: { question: string; spaceId?: string },
    ctx: ChatToolContext,
  ): Promise<{
    chunks: Array<{
      label: string;
      kind: string;
      sourceId: string;
      title: string | null;
      score: number;
      excerpt: string;
    }>;
    isEmpty: boolean;
  }> {
    // Permission scoping. When a specific space is requested, verify read
    // access to it. When none is given, the search must still stay inside the
    // user's permission boundary — otherwise similarity search would surface
    // chunk text from every space in the workspace, including ones the user
    // cannot read. Scope to the user's accessible spaces, the same boundary
    // SearchService uses for workspace-wide page search.
    let spaceIds: string[] | undefined;
    if (args.spaceId) {
      let ability;
      try {
        ability = await this.spaceAbility.createForUser(
          ctx.user,
          args.spaceId,
        );
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
    } else {
      spaceIds = await this.spaceMemberRepo.getUserSpaceIds(ctx.user.id);
      if (spaceIds.length === 0) {
        return { isEmpty: true, chunks: [] };
      }
    }

    try {
      const context = await this.retrieval.retrieve({
        question: args.question,
        workspaceId: ctx.workspaceId,
        spaceId: args.spaceId,
        spaceIds,
      });

      return {
        isEmpty: context.isEmpty,
        chunks: context.chunks.map((c) => ({
          label: c.label,
          kind: c.kind,
          sourceId: c.sourceId,
          title: c.title,
          score: c.score,
          excerpt: c.chunkText.slice(0, 300),
        })),
      };
    } catch {
      return { isEmpty: true, chunks: [] };
    }
  }
}
