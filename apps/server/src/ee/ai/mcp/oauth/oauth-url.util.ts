import type { IncomingMessage } from 'node:http';
import { MCP_RESOURCE_PATH } from './oauth.constants';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface OAuthUrls {
  /** Bare origin — AS issuer identifier, e.g. https://app.conqrhub.com */
  origin: string;
  /** AS issuer (== origin). */
  issuer: string;
  /** Canonical MCP resource id / token audience, e.g. https://app.conqrhub.com/mcp */
  resource: string;
  /** Path-aware protected-resource-metadata URL (primary). */
  prmUrl: string;
  /** Root protected-resource-metadata URL (fallback). */
  prmRootUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string;
  revocationEndpoint: string;
}

/**
 * Derive the OAuth identifiers from the incoming request's host so the AS is
 * correct for both self-hosted (single host) and cloud (subdomain-per-workspace)
 * deployments. The issuer the client validates must equal the host it connected
 * to, so we must not hardcode APP_URL here.
 */
export function resolveOAuthUrls(
  req: IncomingMessage,
  opts: { defaultHttps: boolean },
): OAuthUrls {
  const forwardedProto = firstHeader(req.headers['x-forwarded-proto']);
  const proto = forwardedProto
    ? forwardedProto.split(',')[0].trim()
    : opts.defaultHttps
      ? 'https'
      : 'http';

  const forwardedHost = firstHeader(req.headers['x-forwarded-host']);
  const host = (forwardedHost || req.headers.host || '').split(',')[0].trim();

  const origin = `${proto}://${host}`;
  return {
    origin,
    issuer: origin,
    resource: `${origin}${MCP_RESOURCE_PATH}`,
    prmUrl: `${origin}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`,
    prmRootUrl: `${origin}/.well-known/oauth-protected-resource`,
    authorizationEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
    registrationEndpoint: `${origin}/oauth/register`,
    revocationEndpoint: `${origin}/oauth/revoke`,
  };
}

function firstHeader(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * A redirect_uri is registrable if it is HTTPS (any host) or an HTTP loopback
 * address (native-client exception per OAuth 2.1 / RFC 8252). Everything else
 * — plain http to a remote host, custom schemes, javascript:, data: — is
 * rejected.
 */
export function isRegistrableRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false; // no fragment allowed in a redirect URI
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
    return true;
  }
  return false;
}

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Does `candidate` match one of the client's `registered` redirect URIs?
 * Exact-string match, EXCEPT loopback URIs match port-agnostically (native
 * clients like Claude Code bind an ephemeral localhost port per session).
 * No trailing-slash normalisation is applied.
 */
export function redirectUriMatches(
  registered: string[],
  candidate: string,
): boolean {
  if (!candidate) return false;
  return registered.some((r) => singleRedirectMatch(r, candidate));
}

function singleRedirectMatch(registered: string, candidate: string): boolean {
  if (registered === candidate) return true;

  let a: URL;
  let b: URL;
  try {
    a = new URL(registered);
    b = new URL(candidate);
  } catch {
    return false;
  }

  const bothLoopback =
    a.protocol === 'http:' &&
    b.protocol === 'http:' &&
    isLoopbackHost(a.hostname) &&
    isLoopbackHost(b.hostname);

  if (!bothLoopback) return false;

  // Port-agnostic loopback comparison: same host + path + query, ignore port.
  return (
    a.hostname.toLowerCase() === b.hostname.toLowerCase() &&
    a.pathname === b.pathname &&
    a.search === b.search
  );
}
