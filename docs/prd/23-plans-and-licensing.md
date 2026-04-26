# PRD 23 — Plans & Licensing

> **Source:** PA 23, lines 5977–6127.

## Area overview

How the product is sold, how features are gated, and how that gating is enforced. Architecture: [`../architecture/feature-gating.md`](../architecture/feature-gating.md), [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md).

## Epic 23.1 — Plans

Three public tiers + an internal `standard` tier:

| Tier | Audience |
|---|---|
| **Community (Free)** | Individuals, small teams, OSS users |
| **Business** | Teams needing identity, sharing, and content quality controls (no AI features) |
| **Enterprise** | Orgs needing governance, compliance, AI, scale |

**AI is Enterprise-only.** All four AI surfaces (AI Search, AI Answers, AI Chat, AI Assistant), MCP, and the documentation-intelligence features are gated behind `Feature.AI` / `Feature.MCP`, which are bundled into the Enterprise tier and **not** into Business. Full mapping in [`../product/plans-and-pricing.md`](../product/plans-and-pricing.md).

## Epic 23.2 — Feature Gating

### Feature 23.2.1 — Server-side gating

`LicenseCheckService.hasFeature(workspace.licenseKey, Feature.X)` is called inside the controller / service that runs the gated logic. Returns `false` → `ForbiddenException`.

### Feature 23.2.2 — Client-side gating

`useHasFeature('flag')` reads the entitlement atom (`atomWithStorage`). Atom is hydrated from `POST /workspace/entitlements`.

### Feature 23.2.3 — Feature flag list

Defined in `apps/server/src/common/features.ts` and `apps/client/src/ee/features.ts`. Full list: [`../reference/feature-flags.md`](../reference/feature-flags.md).

### Feature 23.2.4 — Tier resolution

`LicenseCheckService.resolveTier()` returns `free | standard | business | enterprise`.

### Feature 23.2.5 — Lock-state UX

When a feature is locked, the upgrade label adapts:

- **Cloud** → *Upgrade your plan*
- **Self-hosted free** → *Available with a paid license*
- **Self-hosted paid** → *Upgrade your license tier*

## Epic 23.3 — Licensing (self-hosted)

### Feature 23.3.1 — License activation

`POST /license/activate` accepts a signed key. Verified with `LICENSE_PUBLIC_KEY`. No network required → air-gapped friendly.

### Feature 23.3.2 — License removal

`POST /license/remove` reverts to free tier. Data preserved.

### Feature 23.3.3 — Trial keys

Short-dated, signed identically. Workspaces revert to free tier on expiry.

### Feature 23.3.4 — License model

```ts
interface ILicenseInfo {
  customerName: string;
  seatCount: number;
  licenseType: 'business' | 'enterprise';
  issuedAt: string;
  expiresAt: string;
  trial: boolean;
}
```

### Feature 23.3.5 — Audit

`LICENSE_ACTIVATED` and `LICENSE_REMOVED` events captured.

## Epic 23.4 — Cloud billing

`CLOUD=true`. Stripe-managed subscriptions. See [`../deployment/cloud.md`](../deployment/cloud.md) and [`../admin/billing-and-license.md`](../admin/billing-and-license.md).

### Feature 23.4.1 — Plan endpoints

`/billing/info` · `/billing/plans` · `/billing/checkout` · `/billing/portal`.

### Feature 23.4.2 — Webhook flow

Stripe webhooks on `BILLING_QUEUE`. Plan record on workspace updated → next entitlement refresh propagates.

### Feature 23.4.3 — Seat sync

`STRIPE_SEATS_SYNC` job reconciles Stripe seats with active members.

## Cross-references

- Plans/pricing: [`../product/plans-and-pricing.md`](../product/plans-and-pricing.md)
- Feature flags: [`../reference/feature-flags.md`](../reference/feature-flags.md)
- Architecture: [`../architecture/feature-gating.md`](../architecture/feature-gating.md), [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md)
- Admin billing: [`../admin/billing-and-license.md`](../admin/billing-and-license.md)
