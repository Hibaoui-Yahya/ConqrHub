import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from '../../search/search.service';
import { PlaneClientService } from './plane-client.service';
import { DelegatedTokenService } from './delegated-token.service';
import { DELEGATED_SCOPES } from '../domain/delegated-token.util';
import { buildUrn } from '../domain/urn.util';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

export interface FederatedResult {
  source: 'hub' | 'plane';
  type: string;
  urn: string;
  title: string;
  snippet?: string;
  key?: number | null;
  state?: string | null;
  deepLinkId?: string;
  /** Absolute link into the owning product (present when resolvable). */
  deepLink?: string;
}

// Bound each half of a federated query. One workspace-wide work-item search,
// so there is no per-project fan-out to cap any more. Set generously: the
// caller slices to its own limit, and an agent reasoning over the result is
// better served by the full candidate set than by a short one.
const PLANE_SEARCH_LIMIT = 50;
const HUB_SEARCH_LIMIT = 50;

/**
 * Permission-aware unified search (blueprint §5.3B). Federates Hub knowledge
 * (Typesense/BM25, already workspace-scoped) with ConqrPlan work items,
 * returning one result shape that identifies its source product.
 *
 * Authorization note: Hub results are permission-filtered by Hub. Work-item
 * results come from ConqrPlan's search endpoint under a delegated token, so
 * they are filtered to the projects the searcher is actually a member of.
 */
@Injectable()
export class FederatedSearchService {
  private readonly logger = new Logger(FederatedSearchService.name);

  constructor(
    private readonly hubSearch: SearchService,
    private readonly plane: PlaneClientService,
    private readonly environment: EnvironmentService,
    private readonly delegation: DelegatedTokenService,
  ) {}

  async search(
    query: string,
    opts: { workspaceId: string; userId: string; planeProjectId?: string },
  ): Promise<{ items: FederatedResult[]; sources: string[] }> {
    const trimmed = (query ?? '').trim();
    if (!trimmed) return { items: [], sources: [] };

    const [hub, plane] = await Promise.all([
      this.searchHub(trimmed, opts),
      this.searchPlane(trimmed, opts),
    ]);

    const sources: string[] = [];
    if (hub.length) sources.push('hub');
    if (plane.length) sources.push('plane');

    // Interleave so neither product dominates the top of the list.
    return { items: interleave(hub, plane), sources };
  }

  private async searchHub(
    query: string,
    opts: { workspaceId: string; userId: string },
  ): Promise<FederatedResult[]> {
    try {
      const res = await this.hubSearch.searchPage(
        { query, limit: HUB_SEARCH_LIMIT } as any,
        { workspaceId: opts.workspaceId, userId: opts.userId },
      );
      return (res.items ?? []).map((p: any) => ({
        source: 'hub' as const,
        type: 'page',
        urn: buildUrn('hub', 'page', p.id),
        title: p.title ?? 'Untitled',
        snippet: p.highlight ?? undefined,
        deepLinkId: p.slugId ?? p.id,
      }));
    } catch (err) {
      this.logger.warn(`Hub search failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async searchPlane(
    query: string,
    opts: { workspaceId: string; userId: string; planeProjectId?: string },
  ): Promise<FederatedResult[]> {
    if (!this.plane.isEnabled()) return [];

    // One workspace-wide search rather than a fan-out over the first few
    // mapped projects. The old path called the issue LIST endpoint with a
    // `search` parameter it does not support, so every query came back with
    // the same arbitrary first items of those projects — results that matched
    // nothing the caller asked for, presented as hits.
    try {
      const { results } = await this.plane.searchWorkItems(
        {
          query,
          limit: PLANE_SEARCH_LIMIT,
          projectId: opts.planeProjectId,
        },
        // The Hub half of this search is already filtered to what the
        // searcher may read; the ConqrPlan half has to be too, or federated
        // search becomes a way to read titles from projects you are not in.
        this.delegation.mintCallContext(opts.userId, opts.workspaceId, [
          DELEGATED_SCOPES.workItemRead,
        ]),
      );
      const appUrl = this.environment.getPlaneAppUrl();
      const slug = this.environment.getPlaneWorkspaceSlug();
      return results.map((wi) => ({
        source: 'plane' as const,
        type: 'work-item',
        urn: buildUrn('plane', 'work-item', wi.id),
        title: wi.name,
        key: wi.sequence_id ?? null,
        state: wi.state__name ?? null,
        deepLink:
          appUrl && slug && wi.project_id
            ? `${appUrl}/${slug}/projects/${wi.project_id}/issues/${wi.id}`
            : undefined,
      }));
    } catch (err) {
      this.logger.warn(`Plane search failed: ${(err as Error).message}`);
      return [];
    }
  }
}

function interleave(a: FederatedResult[], b: FederatedResult[]): FederatedResult[] {
  const out: FederatedResult[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}
