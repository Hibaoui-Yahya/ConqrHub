import { Injectable } from '@nestjs/common';
import { AiProviderService } from '../providers/ai-provider.service';
import { EmbeddingRepository } from '../embeddings/embedding.repository';

export interface SimilarWorkItem {
  workItemId: string;
  projectId: string | null;
  title: string | null;
  sequenceId: number | null;
  state: string | null;
  labels: string[];
  url: string | null;
  score: number;
}

const OVERSAMPLE = 4; // chunks-per-item headroom before grouping
const DEFAULT_LIMIT = 5;

/**
 * Semantic work-item intelligence (gap-analysis A2): duplicate detection and
 * label prediction over the plane_work_item embedding space. Consumed by
 * ConqrPlane's create-work-item and intake surfaces.
 */
@Injectable()
export class WorkIntelService {
  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async findSimilar(opts: {
    workspaceId: string;
    title: string;
    description?: string;
    limit?: number;
  }): Promise<SimilarWorkItem[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const raw = await this.retrieve(opts, limit);

    const byItem = new Map<string, SimilarWorkItem>();
    for (const r of raw) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const existing = byItem.get(r.sourceId);
      if (existing && existing.score >= r.score) continue;
      byItem.set(r.sourceId, {
        workItemId: r.sourceId,
        projectId: (meta.projectId as string) ?? null,
        title: (meta.title as string) ?? null,
        sequenceId: (meta.sequenceId as number) ?? null,
        state: (meta.state as string) ?? null,
        labels: (meta.labels as string[]) ?? [],
        url: (meta.url as string) ?? null,
        score: r.score,
      });
    }

    return Array.from(byItem.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async predictLabels(opts: {
    workspaceId: string;
    title: string;
    description?: string;
    limit?: number;
  }): Promise<{ labels: { label: string; confidence: number }[] }> {
    const raw = await this.retrieve(opts, opts.limit ?? DEFAULT_LIMIT);

    // Weight each label by the best chunk score per work item that carries it.
    const bestPerItem = new Map<string, { score: number; labels: string[] }>();
    for (const r of raw) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const labels = (meta.labels as string[]) ?? [];
      const existing = bestPerItem.get(r.sourceId);
      if (!existing || r.score > existing.score) {
        bestPerItem.set(r.sourceId, { score: r.score, labels });
      }
    }

    const weights = new Map<string, number>();
    let total = 0;
    for (const { score, labels } of bestPerItem.values()) {
      for (const label of labels) {
        weights.set(label, (weights.get(label) ?? 0) + score);
        total += score;
      }
    }
    if (total === 0) return { labels: [] };

    const labels = Array.from(weights.entries())
      .map(([label, w]) => ({ label, confidence: w / total }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    return { labels };
  }

  private async retrieve(
    opts: { workspaceId: string; title: string; description?: string },
    limit: number,
  ) {
    if (!this.aiProvider.isAvailable()) return [];
    const query = [opts.title, opts.description].filter(Boolean).join('\n\n');
    if (!query.trim()) return [];
    const [embedding] = await this.aiProvider.embedMany([query]);
    return this.repo.similaritySearch({
      workspaceId: opts.workspaceId,
      queryEmbedding: embedding,
      sourceKind: 'plane_work_item',
      topK: limit * OVERSAMPLE,
    });
  }
}
