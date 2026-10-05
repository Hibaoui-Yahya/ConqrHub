/**
 * Redis key under which JwtStrategy caches a validated `{ user, workspace }`
 * for a session (or API key) for JWT_VALIDATE_CACHE_TTL_SECONDS. Shared with
 * SessionService so that revoking a session deletes exactly this key (F29).
 */
export function jwtAuthCacheKey(workspaceId: string, id: string): string {
  return `jwt:auth:${workspaceId}:${id}`;
}
