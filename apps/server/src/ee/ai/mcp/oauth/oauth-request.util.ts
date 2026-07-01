import type { FastifyRequest } from 'fastify';
import { Workspace } from '@docmost/db/types/entity.types';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import { AI_FEATURE_DEFAULTS } from '../../feature.constants';

/**
 * The host-resolved workspace set by DomainMiddleware, IF it ran. It does NOT
 * run for the OAuth / .well-known routes: NestJS does not apply middleware to
 * paths excluded from the global `/api` prefix (nestjs/nest#9124, #11572,
 * #13401), and these routes are all served at the bare origin. So this is
 * usually undefined here — prefer {@link resolveRequestWorkspace}.
 */
export function getRequestWorkspace(
  req: FastifyRequest,
): Workspace | undefined {
  return (req.raw as any)?.workspace ?? (req as any)?.raw?.workspace;
}

/**
 * Resolve the workspace for a bare-origin OAuth request, mirroring
 * DomainMiddleware (self-hosted → the single workspace; cloud → the subdomain's
 * workspace). Prefers the middleware-attached workspace when present (e.g. if a
 * future NestJS release fixes the exclusion bug). This is the workaround the
 * share SEO controller uses for the same reason.
 */
export async function resolveRequestWorkspace(
  req: FastifyRequest,
  workspaceRepo: WorkspaceRepo,
  environmentService: EnvironmentService,
): Promise<Workspace | undefined> {
  const attached = getRequestWorkspace(req);
  if (attached) return attached;

  if (environmentService.isSelfHosted()) {
    return (await workspaceRepo.findFirst()) ?? undefined;
  }

  const host = req.raw.headers.host ?? '';
  const subdomain = host.split('.')[0];
  if (!subdomain) return undefined;
  return (await workspaceRepo.findByHostname(subdomain)) ?? undefined;
}

/** Whether MCP is enabled for the given workspace (matches WorkspaceAiToggleGuard). */
export function isMcpEnabledForWorkspace(
  workspace: Workspace | undefined,
): boolean {
  if (!workspace) return false;
  const settings = (workspace.settings ?? {}) as {
    ai?: Partial<Record<string, boolean>>;
  };
  const stored = settings.ai?.['mcp'];
  return stored ?? AI_FEATURE_DEFAULTS.mcp;
}
