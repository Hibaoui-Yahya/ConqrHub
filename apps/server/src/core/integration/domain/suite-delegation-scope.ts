/**
 * What another suite product may ask to do inside ConqrHub on a person's
 * behalf.
 *
 * Deliberately narrow, and deliberately a closed list rather than a setting.
 * `verifyAssertion` treats an absent `allowedScopes` as "no ceiling", so a
 * trusted issuer could then assert anything it liked; naming the list here
 * makes adding a capability a code change that gets reviewed, next to the
 * route that implements it.
 *
 * Each entry maps to something ConqrHub already does for its own AI tools —
 * `search-pages.tool.ts`, `get-page.tool.ts`, `list-spaces.tool.ts` — so a
 * delegated caller reaches exactly the surface a signed-in person reaches, and
 * reaches it through the same permission checks. A scope is permission to
 * *ask*; whether this particular person may see this particular page is still
 * decided by CASL against their own abilities, every time.
 *
 * Writes are individually scoped. Fabric requires approval for them, while Hub
 * independently applies the person's ordinary permissions.
 */
export const SUITE_DELEGATED_SCOPES = {
  /** Read one page the person may already read. */
  pageRead: 'page:read',
  /** Search pages, scoped to the person's own visibility. */
  pageSearch: 'page:search',
  /** List the spaces the person belongs to. */
  spaceRead: 'space:read',
  commentRead: 'comment:read',
  spaceCreate: 'space:create',
  spaceUpdate: 'space:update',
  pageCreate: 'page:create',
  pageUpdate: 'page:update',
  commentCreate: 'comment:create',
  commentUpdate: 'comment:update',
} as const;

export type SuiteDelegatedScope =
  (typeof SUITE_DELEGATED_SCOPES)[keyof typeof SUITE_DELEGATED_SCOPES];

export const ALL_SUITE_DELEGATED_SCOPES: SuiteDelegatedScope[] = Object.values(
  SUITE_DELEGATED_SCOPES,
);

/** Header a delegated caller presents the assertion in. Matches the name Hub
 * itself uses when it is the issuer (`conqrplan-tool-router.service.ts`), so
 * the suite has one header rather than one per direction. */
export const DELEGATION_HEADER = 'x-conqr-delegation';

/** Correlation id header, same reason. */
export const DELEGATION_CORRELATION_HEADER = 'x-conqr-correlation-id';
