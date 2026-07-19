import { Injectable, Logger } from '@nestjs/common';
import {
  PlaneApiError,
  PlaneClientService,
} from '../../../core/integration/services/plane-client.service';
import { ProjectSpaceMappingRepo } from '@docmost/db/repos/integration/project-space-mapping.repo';
import { AiProviderService } from '../providers/ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChunkingService } from './chunking.service';
import { EmbeddingRepository } from './embedding.repository';

export interface IndexWorkItemResult {
  workItemId: string;
  status:
    | 'indexed'
    | 'skipped'
    | 'deleted'
    | 'no_content'
    | 'ai_unavailable'
    | 'unmapped';
  chunksIndexed?: number;
}

const LABEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Indexes ConqrPlane work items into the suite semantic store (gap-analysis
 * A1). A work item is scoped to the Hub space its Plane project is mapped to;
 * projects without a mapping are deliberately never indexed. Indexing alone
 * does not gate visibility — read-side enforcement lives in
 * `WorkIntelService`, which restricts `similaritySearch` to the caller's
 * readable space ids (via `SpaceMemberRepo.getUserSpaceIds`) before returning
 * any chunk.
 */
@Injectable()
export class WorkItemIndexerService {
  private readonly logger = new Logger(WorkItemIndexerService.name);
  /** projectId → { at, byId } — bounds label lookups under Plane's 60/min API limit. */
  private labelCache = new Map<
    string,
    { at: number; byId: Map<string, string> }
  >();

  constructor(
    private readonly plane: PlaneClientService,
    private readonly mappings: ProjectSpaceMappingRepo,
    private readonly aiProvider: AiProviderService,
    private readonly env: EnvironmentService,
    private readonly chunking: ChunkingService,
    private readonly repo: EmbeddingRepository,
  ) {}

  async indexWorkItem(
    workItemId: string,
    projectId: string,
  ): Promise<IndexWorkItemResult> {
    if (!this.aiProvider.isAvailable()) {
      return { workItemId, status: 'ai_unavailable' };
    }

    const mapping =
      await this.mappings.findPrimaryForProjectAnyWorkspace(projectId);
    if (!mapping) {
      return { workItemId, status: 'unmapped' };
    }

    let item;
    try {
      item = await this.plane.getWorkItem(projectId, workItemId);
    } catch (err) {
      if (err instanceof PlaneApiError && err.status === 404) {
        await this.repo.deleteBySource('plane_work_item', workItemId);
        return { workItemId, status: 'deleted' };
      }
      throw err;
    }

    if (item.archived_at) {
      await this.repo.deleteBySource('plane_work_item', workItemId);
      return { workItemId, status: 'deleted' };
    }

    const text = [item.name, item.description_stripped]
      .filter(Boolean)
      .join('\n\n');
    if (!text.trim()) {
      await this.repo.deleteBySource('plane_work_item', workItemId);
      return { workItemId, status: 'no_content' };
    }

    const model = this.env.getAiEmbeddingModel() || 'mistral-embed';
    const dim = this.aiProvider.getEmbeddingDimension();
    const contentHash = this.chunking.contentHash(text);

    const unchanged = await this.repo.isContentUnchanged(
      'plane_work_item',
      workItemId,
      model,
      contentHash,
    );
    if (unchanged) {
      return { workItemId, status: 'skipped' };
    }

    const chunks = this.chunking.chunk(text, {
      chunkChars: this.env.getAiEmbeddingChunkChars(),
      overlap: this.env.getAiEmbeddingChunkOverlap(),
    });
    if (chunks.length === 0) {
      await this.repo.deleteBySource('plane_work_item', workItemId);
      return { workItemId, status: 'no_content' };
    }

    const batchSize = this.env.getAiEmbeddingBatchSize();
    const texts = chunks.map((c) => c.chunkText);
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const vectors = await this.aiProvider.embedMany(
        texts.slice(i, i + batchSize),
      );
      allEmbeddings.push(...vectors);
    }

    const labelNames = await this.resolveLabelNames(
      projectId,
      item.labels ?? [],
    );
    const appUrl = this.env.getPlaneAppUrl();
    const slug = this.env.getPlaneWorkspaceSlug();
    const url =
      appUrl && slug
        ? `${appUrl}/${slug}/projects/${projectId}/issues/${workItemId}`
        : null;

    const metadata = {
      workItemId,
      projectId,
      title: item.name ?? null,
      sequenceId: item.sequence_id ?? null,
      state: item.state_detail?.name ?? null,
      labels: labelNames,
      url,
    };

    await this.repo.upsertChunks({
      workspaceId: mapping.workspaceId,
      spaceId: mapping.spaceId,
      sourceKind: 'plane_work_item',
      sourceId: workItemId,
      model,
      dim,
      contentHash,
      chunks: chunks.map((c, i) => ({
        chunkIndex: c.chunkIndex,
        chunkText: c.chunkText,
        embedding: allEmbeddings[i],
        metadata,
      })),
    });

    this.logger.debug(
      `Indexed work item ${workItemId}: ${chunks.length} chunk(s) (model=${model})`,
    );
    return { workItemId, status: 'indexed', chunksIndexed: chunks.length };
  }

  async deleteWorkItemEmbeddings(workItemId: string): Promise<void> {
    await this.repo.deleteBySource('plane_work_item', workItemId);
  }

  /** Sequentially index every work item in a project (admin backfill). */
  async backfillProject(
    projectId: string,
  ): Promise<{ indexed: number; skipped: number; failed: number }> {
    let indexed = 0;
    let skipped = 0;
    let failed = 0;
    let cursor: string | undefined;

    do {
      const page = await this.plane.listWorkItemsPage(projectId, {
        perPage: 100,
        cursor,
      });
      for (const item of page.results) {
        try {
          const res = await this.indexWorkItem(item.id, projectId);
          if (res.status === 'indexed') indexed++;
          else skipped++;
        } catch (err) {
          failed++;
          this.logger.warn(
            `Backfill: failed work item ${item.id}: ${(err as Error).message}`,
          );
        }
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    return { indexed, skipped, failed };
  }

  private async resolveLabelNames(
    projectId: string,
    labelIds: string[],
  ): Promise<string[]> {
    if (labelIds.length === 0) return [];
    try {
      let cached = this.labelCache.get(projectId);
      if (!cached || Date.now() - cached.at > LABEL_CACHE_TTL_MS) {
        const labels = await this.plane.listLabels(projectId);
        cached = {
          at: Date.now(),
          byId: new Map(labels.map((l) => [l.id, l.name])),
        };
        this.labelCache.set(projectId, cached);
      }
      return labelIds
        .map((id) => cached!.byId.get(id))
        .filter((n): n is string => Boolean(n));
    } catch (err) {
      this.logger.warn(
        `Label lookup failed for project ${projectId}: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
