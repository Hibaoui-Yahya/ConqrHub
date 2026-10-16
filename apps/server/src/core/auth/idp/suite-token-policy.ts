/**
 * Server-side policy for suite IdP tokens (ADR-HM-001 v3 §7, §8).
 *
 * Epochs live OUTSIDE the database on purpose: a Postgres restore brings back
 * session and family rows that had been revoked, and an epoch stored in the
 * same database would roll back with them. Every token carries the epoch it
 * was minted under (`ep`); after a restore the operator bumps the variable
 * before the service comes back, and every pre-restore token is refused.
 */

function epochFrom(raw: string | undefined, name: string): number {
  if (raw === undefined || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

/** Epoch for suite IdP tokens (refresh and access). Bump: every client re-signs in. */
export function suiteTokenEpoch(env: NodeJS.ProcessEnv = process.env): number {
  return epochFrom(env.SUITE_TOKEN_EPOCH, 'SUITE_TOKEN_EPOCH');
}

/** Epoch for Hub session cookies. Bump: every Hub user signs in again. */
export function hubSessionEpoch(env: NodeJS.ProcessEnv = process.env): number {
  return epochFrom(env.HUB_SESSION_EPOCH, 'HUB_SESSION_EPOCH');
}

/** Tokens minted before epochs existed carry no `ep`: they count as epoch 0. */
export function epochMatches(claim: unknown, current: number): boolean {
  const ep = claim === undefined || claim === null ? 0 : claim;
  return ep === current;
}

export interface RefreshReusePolicy {
  windowSeconds: number;
  maxReuse: number;
}

/**
 * Constrained idempotent retry for refresh rotation (ADR-HM-001 v3 §4).
 * Default 30 s / 3 reuses, chosen from the rotation tests (lost responses,
 * concurrent BFF processes); `0` restores strict rotation.
 */
export function refreshReusePolicy(
  env: NodeJS.ProcessEnv = process.env,
): RefreshReusePolicy {
  const w = Number(env.SUITE_IDP_REFRESH_REUSE_WINDOW_SECONDS ?? 30);
  const n = Number(env.SUITE_IDP_REFRESH_MAX_REUSE ?? 3);
  return {
    windowSeconds: Number.isFinite(w) && w >= 0 ? Math.min(w, 120) : 30,
    maxReuse: Number.isInteger(n) && n >= 0 ? Math.min(n, 10) : 3,
  };
}

/** The per-request state of a token family, as read from the database. */
export interface FamilyState {
  state: string;
  expiresAt: Date;
  hubSessionId: string | null;
  userId: string;
  workspaceId: string;
  clientId: string;
  userDisabled: boolean;
}

/**
 * Whether a suite access token may still be honoured. A missing row counts as
 * revoked (purged or never existed): missing state never authorizes.
 */
export function familyIsLive(
  family: FamilyState | undefined,
  claims: { userId: string; workspaceId: string; clientId?: string },
  now: Date = new Date(),
): boolean {
  return (
    !!family &&
    family.state === 'active' &&
    family.hubSessionId !== null &&
    family.expiresAt.getTime() > now.getTime() &&
    !family.userDisabled &&
    family.userId === claims.userId &&
    family.workspaceId === claims.workspaceId &&
    (!claims.clientId || family.clientId === claims.clientId)
  );
}

type Methods = ReadonlyArray<string> | '*';

interface RouteRule {
  methods: Methods;
  path: RegExp;
  /** For profile updates: the only body fields this client may change. */
  bodyKeys?: ReadonlyArray<string>;
}

/**
 * ConqrMeet's BFF: the Hub routes it actually calls (its proxy allow-list,
 * narrowed — spaces are listed, never created, updated or deleted — plus the
 * profile reads and preference writes the BFF makes itself).
 */
const MEET_ROUTES: RouteRule[] = [
  { methods: '*', path: /^\/api\/ai\/meeting(\/|$)/ },
  { methods: '*', path: /^\/api\/ai\/meeting-templates(\/|$)/ },
  { methods: ['GET', 'POST'], path: /^\/api\/spaces$/ },
  { methods: ['POST'], path: /^\/api\/ai\/generate$/ },
  { methods: ['POST'], path: /^\/api\/search$/ },
  {
    methods: ['POST'],
    path: /^\/api\/notifications(\/(unread-count|mark-read|mark-all-read))?$/,
  },
  { methods: ['POST'], path: /^\/api\/users\/me$/ },
  {
    methods: ['POST'],
    path: /^\/api\/users\/update$/,
    bodyKeys: ['theme', 'themeCustom', 'meetingDefaults'],
  },
  { methods: ['GET'], path: /^\/api\/attachments\/img\/user\/[^/]+$/ },
];

const PROFILES: Record<string, RouteRule[]> = {
  meet: MEET_ROUTES,
  // Sign-in only (ConqrService, ConqrPlan): /api/idp/userinfo is outside the
  // guarded API, so no API route is allowed.
  'userinfo-only': [],
};

/**
 * SUITE_IDP_CLIENT_PROFILES="conqrmeet:meet,other:userinfo-only".
 * Default: `conqrmeet` is the ConqrMeet BFF; every other client may only
 * sign in.
 */
export function clientProfiles(
  env: NodeJS.ProcessEnv = process.env,
): Map<string, string> {
  const raw = env.SUITE_IDP_CLIENT_PROFILES ?? 'conqrmeet:meet';
  const map = new Map<string, string>();
  for (const entry of raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [client, profile] = entry.split(':').map((p) => p.trim());
    if (client && profile && PROFILES[profile]) map.set(client, profile);
  }
  return map;
}

export type PolicyMode = 'enforce' | 'report';

export function clientPolicyMode(
  env: NodeJS.ProcessEnv = process.env,
): PolicyMode {
  return env.SUITE_IDP_CLIENT_POLICY_MODE === 'report' ? 'report' : 'enforce';
}

/**
 * Whether a suite access token issued to `clientId` may call this route.
 * Deny by default: an unknown client, or a route outside its profile, is
 * refused even though the token is valid.
 */
export function suiteRouteAllowed(
  profiles: Map<string, string>,
  clientId: string | undefined,
  method: string,
  url: string,
  body: unknown,
): boolean {
  const profile = clientId ? profiles.get(clientId) : undefined;
  const rules = profile ? PROFILES[profile] : [];
  const path = (url || '').split('?')[0];
  const verb = method.toUpperCase();
  return rules.some((rule) => {
    if (!rule.path.test(path)) return false;
    if (rule.methods !== '*' && !rule.methods.includes(verb)) return false;
    if (rule.bodyKeys) {
      const keys = body && typeof body === 'object' ? Object.keys(body) : [];
      return keys.every((k) => rule.bodyKeys!.includes(k));
    }
    return true;
  });
}
