import {
  EXPECTED_TOKEN_AUDIENCE_KEY,
  REQUIRED_TOKEN_SCOPE_KEY,
} from '../../../../core/auth/auth.constants';

/**
 * MCP OAuth 2.1 authorization-server constants.
 *
 * ConqrHub acts as a minimal OAuth 2.1 AS for its own MCP resource so that
 * OAuth-based MCP clients (ChatGPT / Claude custom connectors) can connect.
 * Wire-format choices here are pinned to the MCP Authorization spec
 * (2025-06-18) + RFC 8414 / 9728 / 7591 / 7636 / 8707. See
 * docs/superpowers/specs/2026-07-01-mcp-oauth-design.md.
 */

/** Functional scope granting full MCP tool access (CASL enforced per call). */
export const SCOPE_MCP = 'mcp';
/** Signals the client wants a refresh token (Claude only asks if advertised). */
export const SCOPE_OFFLINE_ACCESS = 'offline_access';

/** Advertised in discovery docs. */
export const SUPPORTED_SCOPES = [SCOPE_MCP, SCOPE_OFFLINE_ACCESS];

/** The scope challenged in the /mcp 401 header — must be a subset of granted. */
export const CHALLENGE_SCOPE = SCOPE_MCP;

/** Access token lifetime (seconds). Short so a leaked token self-limits. */
export const ACCESS_TOKEN_TTL_SECONDS = 3600;

/** Auth code lifetime (seconds). Single-use; only lives across the redirect. */
export const AUTH_CODE_TTL_SECONDS = 120;

/** Refresh token lifetime (seconds). 90 days, rotated on every use. */
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Redis key prefix for one-time authorization codes. */
export const AUTH_CODE_REDIS_PREFIX = 'mcp:oauth:code:';

/** Prefix on opaque refresh tokens (the stored value is a sha-256 hash). */
export const REFRESH_TOKEN_PREFIX = 'mcpr_';

/** Marks an api_keys row as an OAuth-issued MCP grant (vs a manual key). */
export const GRANT_TYPE_MCP_OAUTH = 'mcp_oauth';

/** Path segment of the MCP resource (relative to the origin). */
export const MCP_RESOURCE_PATH = '/mcp';

/**
 * Request-scoped marker set by McpAuthGuard on the raw request before Passport
 * runs. JwtStrategy accepts an audience-bound (`aud`) api_key token ONLY when
 * this marker is present and equals the token's audience; on every other route
 * such a token is rejected before any lookup (F27).
 */
export const MCP_EXPECTED_AUDIENCE_KEY = EXPECTED_TOKEN_AUDIENCE_KEY;
/** Scope the MCP route requires of an audience-bound token. */
export const MCP_REQUIRED_SCOPE_KEY = REQUIRED_TOKEN_SCOPE_KEY;
