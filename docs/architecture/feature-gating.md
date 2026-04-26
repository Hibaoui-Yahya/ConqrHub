# Feature Gating

Every paid capability is identified by a string constant (`Feature.<NAME>`), checked server-side before running gated code, and mirrored client-side for UI hiding. This page explains the mechanism end-to-end.

## The constants

Two mirrored files define the canonical list:

- **Server:** `apps/server/src/common/features.ts`
- **Client:** `apps/client/src/ee/features.ts`

```ts
export const Feature = {
  SSO_CUSTOM:         'sso:custom',
  SSO_GOOGLE:         'sso:google',
  MFA:                'mfa',
  API_KEYS:           'api:keys',
  COMMENT_RESOLUTION: 'comment:resolution',
  PAGE_PERMISSIONS:   'page:permissions',
  AI:                 'ai',
  CONFLUENCE_IMPORT:  'import:confluence',
  DOCX_IMPORT:        'import:docx',
  ATTACHMENT_INDEXING:'attachment:indexing',
  SECURITY_SETTINGS:  'security:settings',
  MCP:                'mcp',
  SCIM:               'scim',
  PAGE_VERIFICATION:  'page:verification',
  AUDIT_LOGS:         'audit:logs',
  RETENTION:          'retention',
  SHARING_CONTROLS:   'sharing:controls',
  VIEWER_COMMENTS:    'comment:viewer',
  TEMPLATES:          'templates',
  PDF_EXPORT:         'export:pdf',
};
```

Both files must stay in sync; the strings are the contract.

For a per-feature description, tier mapping, and what each gate controls, see [`../reference/feature-flags.md`](../reference/feature-flags.md).

## Server-side gating

Every gated controller calls into `LicenseCheckService`:

```ts
const canDoIt = await this.licenseCheckService.hasFeature(
  workspace.licenseKey,
  Feature.SECURITY_SETTINGS,
);
if (!canDoIt) throw new ForbiddenException('FEATURE_LOCKED');
```

The gate sits **inside the controller** (or service) — it's not a guard on the route. This is intentional: some endpoints have feature-gated branches and free-tier branches, and the gate is local to the branch.

### How `hasFeature` resolves

| Mode | Source of truth | Behavior |
|---|---|---|
| Cloud | Plan record on workspace | Plan registry maps plan → feature set |
| Self-hosted (paid) | License key on workspace | EE module decodes and validates the key |
| Self-hosted (free / no EE) | — | Returns `false` for everything paid |

### What happens when EE isn't loaded

`hasFeature` returns `false`. The controller throws `ForbiddenException`. The frontend renders the locked UI. No crash, no security hole.

## Client-side gating

```ts
// apps/client/src/ee/entitlement/entitlement-atom.ts
export const entitlementAtom = atomWithStorage<Entitlements | null>(
  'entitlements',
  null
);

type Entitlements = {
  cloud: boolean;
  tier: 'free' | 'standard' | 'business' | 'enterprise';
  features: string[];
};
```

The atom is populated by `POST /workspace/entitlements` on app load and refreshed when the user switches workspaces or activates a license.

Components consume it via:

```ts
// apps/client/src/ee/hooks/use-feature.ts
export const useHasFeature = (feature: string): boolean => {
  const [entitlements] = useAtom(entitlementAtom);
  return entitlements?.features?.includes(feature) ?? false;
};
```

## Lock-state UX

Locked features render a **locked card** that explains why and how to unlock:

| Scenario | Message |
|---|---|
| Cloud workspace on a plan that doesn't include this feature | *Upgrade your plan* — links to billing |
| Self-hosted workspace, free tier | *Available with a paid license* — links to license activation |
| Self-hosted workspace, license that doesn't include this feature | *Upgrade your license tier* — links to license activation |

The lock-state component is in `apps/client/src/ee/components/`.

## Adding a new gated feature

1. **Define the constant** in `apps/server/src/common/features.ts` and `apps/client/src/ee/features.ts` (same key, same string).
2. **Add it to the plan / license schema** so plans and license keys can include or exclude it. (Cloud: plan registry. Self-hosted: license key claim.)
3. **Server:** wrap the gated logic with `LicenseCheckService.hasFeature(...)`.
4. **Client:** wrap the gated UI with `useHasFeature('your:flag')`.
5. **Document it.** Add an entry to [`../reference/feature-flags.md`](../reference/feature-flags.md) and the relevant `[Tier+]` badge wherever the feature is described.
6. **Test it.** Tests should run with the feature off (free tier path) and on (paid path).

## Why feature flags are not the same as remote feature toggles

- These flags are **license / plan** flags. They control commercial entitlements, not experimentation.
- They're stable: once shipped, a flag should not be removed or repurposed without a migration story.
- They are not for A/B tests. The codebase has separate hooks for that if needed.

## Related

- The full `Feature.*` reference: [`../reference/feature-flags.md`](../reference/feature-flags.md)
- How EE actually loads: [`./enterprise-edition.md`](./enterprise-edition.md)
- Plan / pricing: [`../product/plans-and-pricing.md`](../product/plans-and-pricing.md)
- Admin license activation: [`../admin/billing-and-license.md`](../admin/billing-and-license.md)
