# Enterprise Edition (EE) Module

Some features are commercially licensed. They live in a separate code path and are **dynamically loaded** so the open-source build still compiles and runs.

## Where EE code lives

| Path | Status in this repository | What's there |
|---|---|---|
| `apps/server/src/ee/` | **Empty in OSS clones.** Git submodule pointing at private repo `github.com/docmost/ee`. | The server-side implementation of every paid feature |
| `apps/client/src/ee/` | **Present.** Compiles into the SPA bundle. | The client UI for paid features (gated by feature flags) |
| `packages/ee/` | **License stub only.** | LICENSE file |

Confirmed by inspecting the codebase: `apps/server/src/ee/` is registered as a submodule in `.gitmodules`:

```
[submodule "apps/server/src/ee"]
    path = apps/server/src/ee
    url = https://github.com/docmost/ee
```

## Why this design

Three goals:

1. **OSS users can build and run the project** without owning the EE submodule.
2. **EE customers get the paid implementation** without forking the entire repo.
3. **The same client SPA serves both** — features appear or hide based on license.

The split sits on **dynamic backend loading + feature-flag gating on the frontend**.

## Backend dynamic loading

`apps/server/src/app.module.ts` includes a conditional import that resolves the EE module via NestJS's `ModuleRef.create()` (or equivalent) at runtime:

- If the EE submodule is present and exports a module → it's wired into the app graph and EE controllers / services become available.
- If it's not present → the import resolves to `undefined` and the app boots in **free tier**. EE-flagged controllers respond with 403 / `feature unavailable`.

The `LicenseCheckService.hasFeature(workspace.licenseKey, Feature.X)` check is the gate every EE controller uses before running its logic. When the EE module isn't loaded, the call falls through to a stub that always returns `false` for paid features.

## Frontend gating

The client always ships the EE folder. The gating happens in two layers:

1. **`entitlementAtom`** (Jotai) — populated from `POST /workspace/entitlements`, contains the active tier and the list of feature strings the workspace has.
2. **`useHasFeature(flag)`** — React hook that reads the atom.

```tsx
function MaybeAuditPage() {
  const canSeeAudit = useHasFeature('audit:logs');
  if (!canSeeAudit) return <FeatureLockedCard label="Available with Enterprise" />;
  return <AuditLogPage />;
}
```

The "feature locked" card adapts its CTA depending on context:

| Context | Label |
|---|---|
| Cloud (no EE plan) | *Upgrade your plan* |
| Self-hosted, free tier | *Available with a paid license* |
| Self-hosted, paid but missing feature | *Upgrade your license tier* |

## License resolution

The `LicenseCheckService` exposes:

| Method | Purpose |
|---|---|
| `isValidEELicense(key)` | Validates the format and signature of a license key |
| `hasFeature(key, feature)` | Checks if the given license includes a feature flag |
| `getFeatures(key)` | All feature flags in a license |
| `resolveFeatures()` | The active features for the *current request* — different in cloud vs self-hosted |
| `resolveTier()` | Returns `free \| standard \| business \| enterprise` |

### Cloud mode (`CLOUD=true`)

- License keys are **not used** — the source of truth is the workspace's subscription plan record.
- `resolveFeatures()` queries the plan registry: "this plan grants these features."
- Trial periods are managed at the plan level.

### Self-hosted mode (`CLOUD=false`, default)

- License key is stored on the workspace.
- `resolveFeatures()` decodes and verifies the signed key, then returns its feature list.
- License activation: `POST /license/activate` accepts a key, validates it, persists it.
- License removal: `POST /license/remove` clears it.
- **Trial keys** are signed with a short expiry and revert to free tier when expired.
- **Air-gapped support** — license validation does not require outbound network calls.

## Behavior when EE submodule is missing

- The server boots normally.
- Any call to `LicenseCheckService.hasFeature()` returns `false` (since there's no implementation, the fallback registers no features).
- All EE controllers either don't get registered (if they're imported only inside the EE module) or return 403.
- The frontend hides EE UI behind `useHasFeature` checks — users see a free-tier experience.

## Behavior in cloud

- The submodule is present (cloud builds use the private EE).
- `LicenseCheckService.resolveFeatures()` reads from plan records, not from license keys.
- Stripe webhooks land on `BILLING_QUEUE` and update plan records, which causes entitlement changes to propagate to the client on next `entitlementAtom` refresh.

## What this means for documentation

If a doc page describes a feature that exists only in EE, that's flagged with a tier badge `[Business+]` or `[Enterprise]`. Anyone reading from an OSS clone of this repo will see the **gating UI** in their app even though they can run the app fine — the feature itself requires the submodule.

## Related

- Feature flag list: [`./feature-gating.md`](./feature-gating.md)
- Per-feature deep dives: rest of [`./README.md`](./README.md)
- Admin license activation UX: [`../admin/billing-and-license.md`](../admin/billing-and-license.md)
- Cloud billing internals (Stripe): [`../deployment/cloud.md`](../deployment/cloud.md)
