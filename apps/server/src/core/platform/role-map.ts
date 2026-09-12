/**
 * ConqrHub — Conqr platform integration.
 *
 * ConqrAccess **application roles** to ConqrHub workspace roles.
 *
 * This is the same seam the ConqrService canary proved, applied to a product with a much richer
 * permission model. The rules are identical, and they are identical on purpose: if each product
 * needs its own reasoning about what a platform role means, the platform is a framework rather
 * than a platform.
 *
 *   1. **Only ConqrAccess application grants are inputs.** Not a tenant role, not a ZITADEL grant,
 *      not a claim from an id token, not an e-mail domain, and not ConqrHub's own session cookie.
 *      A tenant role maps to nothing here, which is finding `G-01`.
 *   2. **An unknown grant maps to nothing.** The default is empty, never permissive.
 *   3. **Space roles are not reachable from the platform.** ConqrHub's real access control is at
 *      the space and page level — `SpaceRole` (admin/writer/expert/reader) and
 *      `PagePermissionRole` — and those are granted inside the product, per space, by somebody who
 *      already belongs to it. A workspace role obtained from the platform is the right to *be* in
 *      the workspace, not the right to read everything in it.
 *
 * Rule 3 is the one worth dwelling on, because ConqrHub differs from ConqrService here in a way
 * that favours it: `SpaceAbilityFactory` resolves a person's space role purely from `space_members`
 * rows and throws when there is none — there is no owner or admin bypass into a space. So a
 * platform-granted `conqrhub.owner` still cannot read a private space they were never added to.
 * That property is load-bearing for this integration and is asserted in the spec.
 */
import { UserRole } from '../../common/helpers/types/permission';

/**
 * The allowlist, stated as data so it can be read at a glance and tested exhaustively.
 *
 *   conqrhub.member → member (use the workspace; space access still granted per space)
 *   conqrhub.admin  → admin  (manage members, groups, spaces and settings; not audit)
 *   conqrhub.owner  → owner  (everything admin has, plus audit and the destructive settings)
 *
 * The owner/admin split mirrors what `WorkspaceAbilityFactory` already enforces: the owner can
 * `manage` the `Audit` subject and the admin cannot. Flattening the two here would have quietly
 * handed every platform-granted administrator the audit log.
 */
const APPLICATION_ROLE_TO_HUB: Record<string, UserRole> = {
  'conqrhub.member': UserRole.MEMBER,
  'conqrhub.admin': UserRole.ADMIN,
  'conqrhub.owner': UserRole.OWNER,
};

/** The ConqrAccess application id this product is registered under. */
export const APPLICATION_ID = 'conqrhub';

/** Ranked weakest to strongest, so holding several grants resolves to the strongest. */
const RANK: Record<UserRole, number> = {
  [UserRole.MEMBER]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.OWNER]: 3,
};

/**
 * Map the explicit application grants ConqrAccess reports onto this product's workspace role.
 *
 * Returns `null` when the platform reported no ConqrHub grant this build understands. That is a
 * refusal, not a default: the caller must deny rather than fall back to `member`, because a
 * permissive default is how an unknown future role becomes access nobody granted.
 */
export function mapApplicationRoles(applicationGrants: readonly string[]): UserRole | null {
  let best: UserRole | null = null;
  for (const grant of applicationGrants) {
    const role = APPLICATION_ROLE_TO_HUB[grant];
    if (!role) continue;
    if (best === null || RANK[role] > RANK[best]) best = role;
  }
  return best;
}

/** The ConqrAccess application roles this product understands, for documentation and tests. */
export const KNOWN_APPLICATION_ROLES = Object.keys(APPLICATION_ROLE_TO_HUB);

/**
 * Platform role identifiers that must never confer product authority.
 *
 * Tenant roles establish membership and tenant governance. Listed explicitly so the test asserting
 * they map to nothing fails loudly if anybody ever adds one to the table above.
 */
export const TENANT_ROLES_CONFER_NOTHING = [
  'tenant.owner',
  'tenant.admin',
  'tenant.member',
  'tenant.guest',
];

/**
 * Access that no platform grant can confer, because it is granted per resource inside the product.
 *
 * Space roles and page permissions are relationships between a person and a specific space or page.
 * The platform knows nothing about either and must not be able to manufacture one.
 */
export const NOT_REACHABLE_FROM_PLATFORM = [
  'space:admin',
  'space:writer',
  'space:expert',
  'space:reader',
  'page:reader',
  'page:writer',
];
