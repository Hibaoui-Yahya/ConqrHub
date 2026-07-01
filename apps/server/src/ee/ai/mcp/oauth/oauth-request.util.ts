import type { FastifyRequest } from 'fastify';
import { Workspace } from '@docmost/db/types/entity.types';
import { AI_FEATURE_DEFAULTS } from '../../feature.constants';

/**
 * The host-resolved workspace set by DomainMiddleware (self-hosted: the single
 * workspace; cloud: the subdomain's workspace). Present on `req.raw`.
 */
export function getRequestWorkspace(
  req: FastifyRequest,
): Workspace | undefined {
  return (req.raw as any)?.workspace ?? (req as any)?.raw?.workspace;
}

/** Whether MCP is enabled for the request's resolved workspace. */
export function isMcpEnabledForRequest(req: FastifyRequest): boolean {
  const workspace = getRequestWorkspace(req);
  if (!workspace) return false;
  const settings = (workspace.settings ?? {}) as {
    ai?: Partial<Record<string, boolean>>;
  };
  const stored = settings.ai?.['mcp'];
  return stored ?? AI_FEATURE_DEFAULTS.mcp;
}
