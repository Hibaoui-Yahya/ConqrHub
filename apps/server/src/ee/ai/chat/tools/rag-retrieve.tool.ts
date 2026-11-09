import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
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

export interface RagRetrieveChunk {
  label: string;
  kind: string;
  sourceId: string;
  title: string | null;
  score: number;
  /** Up to 2000 characters of the passage, for the model to read. */
  excerpt: string;
  /** First chunk index of the passage within its source. */
  chunkIndex?: number;
  /** Which retrieval paths surfaced the passage. */
  matchedBy?: Array<'vector' | 'lexical'>;
}

export interface RagRetrieveResult {
  chunks: RagRetrieveChunk[];
  isEmpty: boolean;
  /** Set when retrieval itself failed; the model should say so, not guess. */
  error?: string;
}

@Injectable()
export class RagRetrieveTool implements ChatTool, OnModuleInit {
  private readonly logger = new Logger(RagRetrieveTool.name);

  readonly name = 'rag_retrieve';
  readonly description =
    'Retrieve relevant knowledge from the ConqrHub knowledge base using hybrid semantic + keyword search. Use this when the user asks about specific content, asks for detailed information, or when general knowledge might not be sufficient. Exact names, client names and acronyms are matched literally. Returns context chunks with source labels.';
  readonly parameters = z.object({
    question: z
      .string()
      .describe('The question or topic to search for in the knowledge base'),
    spaceId: z
      .string()
      .optional()
      .describe('Optional space ID to restrict the search to a specific space'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe('Maximum number of passages to return (1-20, default 10)'),
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
    args: { question: string; spaceId?: string; limit?: number },
    ctx: ChatToolContext,
  ): Promise<RagRetrieveResult> {
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
    } else {
      spaceIds = await this.spaceMemberRepo.getUserSpaceIds(ctx.user.id);
      if (spaceIds.length === 0) {
        return { isEmpty: true, chunks: [] };
      }
    }

    try {
      const context = await this.retrieval.retrieve({
        userId: ctx.user.id,
        question: args.question,
        workspaceId: ctx.workspaceId,
        spaceId: args.spaceId,
        spaceIds,
        topK: args.limit,
      });

      return {
        isEmpty: context.isEmpty,
        chunks: context.chunks.map((c) => ({
          label: c.label,
          kind: c.kind,
          sourceId: c.sourceId,
          title: c.title,
          score: c.score,
          excerpt: c.chunkText.slice(0, 2000),
          chunkIndex: c.chunkIndex,
          matchedBy: c.matchedBy,
          ...(c.attachmentId
            ? { attachmentId: c.attachmentId, fileName: c.fileName }
            : {}),
        })),
      };
    } catch (err) {
      // Surface the failure instead of pretending the knowledge base is
      // empty: an empty result reads as "nothing documented", an error does not.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `rag_retrieve failed for user ${ctx.user.id} in workspace ${ctx.workspaceId}: ${message}`,
      );
      return { isEmpty: true, chunks: [], error: message };
    }
  }
}
