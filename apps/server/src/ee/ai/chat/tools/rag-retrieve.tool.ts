import { ForbiddenException, Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { RagRetrievalService } from '../../rag/rag-retrieval.service';
import SpaceAbilityFactory from '../../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../../core/casl/interfaces/space-ability.type';
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
    if (args.spaceId) {
      try {
        const ability = await this.spaceAbility.createForUser(
          ctx.user,
          args.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          throw new ForbiddenException(
            `You do not have access to space ${args.spaceId}`,
          );
        }
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        // Space permissions lookup failed — proceed with workspace-scoped search
      }
    }

    try {
      const context = await this.retrieval.retrieve({
        question: args.question,
        workspaceId: ctx.workspaceId,
        spaceId: args.spaceId,
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
