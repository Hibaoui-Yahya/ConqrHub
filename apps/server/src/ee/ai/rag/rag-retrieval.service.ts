import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../providers/ai-provider.service';
import {
  EmbeddingRepository,
  SimilarityResult,
} from '../embeddings/embedding.repository';

export interface ContextChunk {
  kind: 'expert_insight' | 'page';
  sourceId: string;
  chunkText: string;
  title: string | null;
  score: number;
  label: string;
}

export interface RetrievedContext {
  chunks: ContextChunk[];
  contextText: string;
  isEmpty: boolean;
}

const MAX_CONTEXT_CHARS = 6_000;
const DEFAULT_TOP_K = 8;

@Injectable()
export class RagRetrievalService {
  private readonly logger = new Logger(RagRetrievalService.name);

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async retrieve(opts: {
    question: string;
    workspaceId: string;
    spaceId?: string;
    pageId?: string;
    topK?: number;
  }): Promise<RetrievedContext> {
    const { question, workspaceId, spaceId, pageId } = opts;
    const topK = opts.topK ?? DEFAULT_TOP_K;

    const queryEmbedding = await this.aiProvider.embed(question);

    const raw = await this.repo.similaritySearch({
      workspaceId,
      spaceId,
      queryEmbedding,
      sourceId: pageId,
      topK,
    });

    return this.assembleContext(raw);
  }

  assembleContext(raw: SimilarityResult[]): RetrievedContext {
    const insights = raw.filter((r) => r.sourceKind === 'expert_insight');
    const pages = raw.filter((r) => r.sourceKind === 'page');

    const chunks: ContextChunk[] = [];
    let remaining = MAX_CONTEXT_CHARS;

    let insightIdx = 1;
    for (const r of insights) {
      if (remaining <= 0) break;
      const title = this.extractTitle(r.metadata);
      const text = r.chunkText.slice(0, remaining);
      remaining -= text.length;
      chunks.push({
        kind: 'expert_insight',
        sourceId: r.sourceId,
        chunkText: text,
        title,
        score: r.score,
        label: `E${insightIdx++}`,
      });
    }

    let pageIdx = 1;
    for (const r of pages) {
      if (remaining <= 0) break;
      const title = this.extractTitle(r.metadata);
      const text = r.chunkText.slice(0, remaining);
      remaining -= text.length;
      chunks.push({
        kind: 'page',
        sourceId: r.sourceId,
        chunkText: text,
        title,
        score: r.score,
        label: `P${pageIdx++}`,
      });
    }

    const contextText = this.renderContextText(chunks);
    return { chunks, contextText, isEmpty: chunks.length === 0 };
  }

  private renderContextText(chunks: ContextChunk[]): string {
    if (chunks.length === 0) return '';

    const expertChunks = chunks.filter((c) => c.kind === 'expert_insight');
    const pageChunks = chunks.filter((c) => c.kind === 'page');

    const parts: string[] = [];

    if (expertChunks.length > 0) {
      parts.push('[Expert Insights]');
      for (const c of expertChunks) {
        const heading = c.title ? `[${c.label}] ${c.title}` : `[${c.label}]`;
        parts.push(`${heading}\n${c.chunkText}`);
      }
    }

    if (pageChunks.length > 0) {
      parts.push('[Pages]');
      for (const c of pageChunks) {
        const heading = c.title ? `[${c.label}] ${c.title}` : `[${c.label}]`;
        parts.push(`${heading}\n${c.chunkText}`);
      }
    }

    return parts.join('\n\n');
  }

  private extractTitle(metadata: Record<string, unknown> | null): string | null {
    return (metadata?.title as string | undefined) ?? null;
  }
}
