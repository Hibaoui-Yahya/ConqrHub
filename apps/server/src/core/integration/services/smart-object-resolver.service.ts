import { Injectable, Logger } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { PlaneClientService, PlaneApiError } from './plane-client.service';
import { parseUrn } from '../domain/urn.util';
import {
  DisplayMode,
  PresentationModel,
  ResolutionState,
} from '../domain/presentation.types';

export interface ResolveContext {
  workspaceId: string;
  viewerId: string;
  /** Needed for Plane work items — their API is project-scoped. */
  planeProjectId?: string;
  displayMode?: DisplayMode;
  locale?: string;
}

/**
 * Common Smart Object Resolver (blueprint §8.6). Returns only fields the viewer
 * is authorized to see plus freshness state, so a single UI component can
 * render any linked object. Failures degrade explicitly (stale/unavailable/
 * restricted) instead of throwing.
 */
@Injectable()
export class SmartObjectResolverService {
  private readonly logger = new Logger(SmartObjectResolverService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly planeClient: PlaneClientService,
    private readonly environment: EnvironmentService,
  ) {}

  async resolve(
    urn: string,
    ctx: ResolveContext,
  ): Promise<PresentationModel> {
    let parsed;
    try {
      parsed = parseUrn(urn);
    } catch {
      return { urn, state: ResolutionState.NotFound };
    }

    if (parsed.product === 'plane') {
      return this.resolvePlane(parsed.type, parsed.id, urn, ctx);
    }
    if (parsed.product === 'hub') {
      return this.resolveHub(parsed.type, parsed.id, urn, ctx);
    }
    return { urn, state: ResolutionState.NotFound };
  }

  async resolveMany(
    urns: string[],
    ctx: ResolveContext,
  ): Promise<PresentationModel[]> {
    // Dedup identical URNs so a page with many cards to the same object makes
    // one source call, not N (blueprint §8.4 "avoid N+1 / batch resolution").
    const unique = Array.from(new Set(urns));
    const resolved = await Promise.all(
      unique.map(async (u) => [u, await this.resolve(u, ctx)] as const),
    );
    const byUrn = new Map<string, PresentationModel>(resolved);
    // Preserve caller order and any duplicates.
    return urns.map(
      (u) => byUrn.get(u) ?? { urn: u, state: ResolutionState.NotFound },
    );
  }

  private async resolvePlane(
    type: string,
    id: string,
    urn: string,
    ctx: ResolveContext,
  ): Promise<PresentationModel> {
    if (!this.planeClient.isEnabled()) {
      return { urn, state: ResolutionState.IntegrationDisabled };
    }
    if (type !== 'work-item') {
      // Other Plane types resolve to a deep link only for now.
      return {
        urn,
        state: ResolutionState.Live,
        deepLink: this.planeDeepLink(type, id, ctx.planeProjectId),
      };
    }
    if (!ctx.planeProjectId) {
      // Cannot locate a project-scoped item without its project.
      return { urn, state: ResolutionState.SourceUnavailable };
    }

    try {
      const item = await this.planeClient.getWorkItem(ctx.planeProjectId, id);
      return {
        urn,
        state: ResolutionState.Live,
        title: item.name,
        fields: {
          key: item.sequence_id ?? null,
          state: item.state_detail?.name ?? item.state ?? null,
          stateGroup: item.state_detail?.group ?? null,
          priority: item.priority ?? null,
          assignees: item.assignees ?? [],
          completed: Boolean(item.completed_at),
        },
        deepLink: this.planeDeepLink('work-item', id, ctx.planeProjectId),
        sourceVersion: item.updated_at,
        lastRefreshedAt: new Date().toISOString(),
        actions: [
          { id: 'open', label: 'Open in Plane', allowed: true },
        ],
      };
    } catch (err) {
      if (err instanceof PlaneApiError) {
        if (err.status === 404) return { urn, state: ResolutionState.Deleted };
        if (err.status === 403)
          return { urn, state: ResolutionState.Restricted };
        // 429/5xx/network → no safe snapshot in this slice.
        return { urn, state: ResolutionState.SourceUnavailable };
      }
      this.logger.warn(`Unexpected resolve error for ${urn}`);
      return { urn, state: ResolutionState.SourceUnavailable };
    }
  }

  private async resolveHub(
    type: string,
    id: string,
    urn: string,
    ctx: ResolveContext,
  ): Promise<PresentationModel> {
    try {
      const page = await this.pageRepo.findById(id, { includeSpace: false });
      if (!page || page.workspaceId !== ctx.workspaceId) {
        return { urn, state: ResolutionState.NotFound };
      }
      if (page.deletedAt) {
        return { urn, state: ResolutionState.Deleted, title: page.title ?? undefined };
      }
      return {
        urn,
        state: ResolutionState.Live,
        title: page.title ?? 'Untitled',
        fields: { spaceId: page.spaceId, icon: page.icon ?? null },
        deepLink: `/p/${page.slugId ?? page.id}`,
        sourceVersion: page.updatedAt
          ? new Date(page.updatedAt as unknown as string).toISOString()
          : undefined,
        lastRefreshedAt: new Date().toISOString(),
        actions: [{ id: 'open', label: 'Open page', allowed: true }],
      };
    } catch {
      return { urn, state: ResolutionState.SourceUnavailable };
    }
  }

  private planeDeepLink(
    type: string,
    id: string,
    projectId?: string,
  ): string | undefined {
    const base = this.environment.getPlaneAppUrl();
    const slug = this.environment.getPlaneWorkspaceSlug();
    if (!base || !slug || !projectId) return undefined;
    if (type === 'work-item') {
      return `${base}/${slug}/projects/${projectId}/issues/${id}`;
    }
    return `${base}/${slug}/projects/${projectId}`;
  }
}
