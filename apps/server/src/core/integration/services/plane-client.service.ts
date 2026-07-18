import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

export interface PlaneWorkItem {
  id: string;
  name: string;
  description_stripped?: string;
  state?: string;
  state_detail?: { name?: string; group?: string };
  priority?: string;
  assignees?: string[];
  project?: string;
  sequence_id?: number;
  updated_at?: string;
  completed_at?: string | null;
  archived_at?: string | null;
}

export class PlaneApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PlaneApiError';
  }
}

/**
 * Thin REST client for Plane (blueprint §8.1). ConqrHub never touches Plane's
 * database — all work data is read through this adapter. Handles auth header,
 * timeout, and surfaces rate-limit / transient failures as retryable so the
 * resolver can degrade to a stale snapshot instead of erroring.
 *
 * The documented Plane API-key limit is ~60 req/min, so callers should cache
 * and batch; this client only enforces a per-request timeout and classifies
 * 429/5xx as retryable.
 */
@Injectable()
export class PlaneClientService {
  private readonly logger = new Logger(PlaneClientService.name);

  constructor(private readonly environment: EnvironmentService) {}

  isEnabled(): boolean {
    return this.environment.isPlaneIntegrationEnabled();
  }

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown; onBehalfOf?: string },
  ): Promise<T> {
    const base = this.environment.getPlaneApiUrl();
    const key = this.environment.getPlaneApiKey();
    if (!base || !key) {
      throw new PlaneApiError('Plane integration is not configured', 503, false);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.environment.getPlaneApiTimeoutMs(),
    );

    try {
      const res = await fetch(`${base}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          'X-Api-Key': key,
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          // On-behalf-of delegation (§9.1): preserve the acting user's identity
          // for user-initiated writes instead of acting as an anonymous bot.
          ...(init?.onBehalfOf
            ? { 'X-Conqr-On-Behalf-Of': init.onBehalfOf }
            : {}),
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        throw new PlaneApiError(
          `Plane API ${res.status} for ${path}`,
          res.status,
          true,
        );
      }
      if (res.status === 404) {
        throw new PlaneApiError(`Not found: ${path}`, 404, false);
      }
      if (!res.ok) {
        throw new PlaneApiError(
          `Plane API ${res.status} for ${path}`,
          res.status,
          false,
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof PlaneApiError) throw err;
      // Network error / timeout — retryable (caller may serve a stale snapshot).
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Plane API request failed for ${path}: ${message}`);
      throw new PlaneApiError(message, 0, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch a single work item. `workspaceSlug` falls back to the configured
   * default when omitted.
   */
  async getWorkItem(
    projectId: string,
    workItemId: string,
    workspaceSlug?: string,
  ): Promise<PlaneWorkItem> {
    const slug = workspaceSlug || this.environment.getPlaneWorkspaceSlug();
    return this.request<PlaneWorkItem>(
      `/workspaces/${slug}/projects/${projectId}/issues/${workItemId}/`,
    );
  }

  /** Create a work item in a Plane project (blueprint §5.1A). */
  async createWorkItem(
    projectId: string,
    input: {
      name: string;
      description_html?: string;
      priority?: string;
      state?: string;
      assignees?: string[];
    },
    opts?: { workspaceSlug?: string; onBehalfOf?: string },
  ): Promise<PlaneWorkItem> {
    const slug = opts?.workspaceSlug || this.environment.getPlaneWorkspaceSlug();
    return this.request<PlaneWorkItem>(
      `/workspaces/${slug}/projects/${projectId}/issues/`,
      { method: 'POST', body: input, onBehalfOf: opts?.onBehalfOf },
    );
  }

  /**
   * List / search work items in a project. `search` filters by name where the
   * Plane API supports it; results are paginated by Plane.
   */
  async listWorkItems(
    projectId: string,
    opts: { search?: string; perPage?: number } = {},
    workspaceSlug?: string,
  ): Promise<{ results: PlaneWorkItem[] }> {
    const slug = workspaceSlug || this.environment.getPlaneWorkspaceSlug();
    const params = new URLSearchParams();
    if (opts.search) params.set('search', opts.search);
    if (opts.perPage) params.set('per_page', String(opts.perPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request<{ results?: PlaneWorkItem[] } | PlaneWorkItem[]>(
      `/workspaces/${slug}/projects/${projectId}/issues/${qs}`,
    );
    // Plane returns either a paginated {results} or a bare array depending on endpoint.
    const results = Array.isArray(res) ? res : (res.results ?? []);
    return { results };
  }
}
