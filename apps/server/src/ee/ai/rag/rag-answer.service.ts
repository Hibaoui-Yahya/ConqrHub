import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { User } from '@docmost/db/types/entity.types';
import { AiProviderService, StreamTextResult } from '../providers/ai-provider.service';
import { RagRetrievalService, RetrievedContext } from './rag-retrieval.service';
import { AskDto } from './dto/ask.dto';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';

const MAX_OUTPUT_TOKENS = 1024;
const RAG_TEMPERATURE = 0.2;

export interface AskResult {
  answer: string;
  sources: Array<{ label: string; kind: string; sourceId: string; title: string | null }>;
  contextEmpty: boolean;
}

@Injectable()
export class RagAnswerService {
  private readonly logger = new Logger(RagAnswerService.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly retrieval: RagRetrievalService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  async ask(dto: AskDto, user: User): Promise<AskResult> {
    if (!this.aiProvider.isAvailable()) {
      throw new ServiceUnavailableException('AI is not configured');
    }

    await this.assertSpaceReadAccess(user, dto.spaceId);

    const context = await this.retrieval.retrieve({
      question: dto.question,
      workspaceId: user.workspaceId,
      spaceId: dto.spaceId,
      pageId: dto.pageId,
      topK: dto.topK,
    });

    const { system, prompt } = buildRagPrompt(dto.question, context);
    const result = await this.aiProvider.generate({
      system,
      prompt,
      temperature: RAG_TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return {
      answer: result.text,
      sources: context.chunks.map((c) => ({
        label: c.label,
        kind: c.kind,
        sourceId: c.sourceId,
        title: c.title,
      })),
      contextEmpty: context.isEmpty,
    };
  }

  askStream(dto: AskDto, user: User): Promise<StreamTextResult> {
    return this.assertSpaceReadAccess(user, dto.spaceId).then(async () => {
      if (!this.aiProvider.isAvailable()) {
        throw new ServiceUnavailableException('AI is not configured');
      }

      const context = await this.retrieval.retrieve({
        question: dto.question,
        workspaceId: user.workspaceId,
        spaceId: dto.spaceId,
        pageId: dto.pageId,
        topK: dto.topK,
      });

      const { system, prompt } = buildRagPrompt(dto.question, context);
      return this.aiProvider.stream({
        system,
        prompt,
        temperature: RAG_TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
    });
  }

  private async assertSpaceReadAccess(user: User, spaceId: string): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this space');
    }
  }
}

function buildRagPrompt(
  question: string,
  context: RetrievedContext,
): { system: string; prompt: string } {
  const system = context.isEmpty
    ? [
        'You are ConqrHub AI, the intelligent knowledge assistant for ConqrHub.',
        'No relevant content was found in the knowledge base for this question.',
        'Politely let the user know you could not find relevant information and suggest they check ConqrHub directly or try rephrasing.',
      ].join(' ')
    : [
        'You are ConqrHub AI, the intelligent knowledge assistant for ConqrHub.',
        'Answer the user\'s question using ONLY the context provided below.',
        'Expert insights (marked [E1], [E2], ...) are verified by domain experts — prefer them when relevant.',
        'Page content (marked [P1], [P2], ...) is from ConqrHub pages.',
        'When you use information from a source, cite it inline using its label (e.g. "[E1]" or "[P2]").',
        'If the context does not contain enough information to answer, say so clearly — do not invent facts.',
        'Be concise and precise.',
      ].join(' ');

  const prompt = context.isEmpty
    ? `Question: ${question}`
    : `Context:\n${context.contextText}\n\nQuestion: ${question}`;

  return { system, prompt };
}
