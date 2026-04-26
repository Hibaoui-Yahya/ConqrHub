# Cloud (managed) deployment

When `CLOUD=true`, the server runs in cloud mode. Same code, different defaults.

## What changes in cloud mode

| Aspect | Self-hosted | Cloud (`CLOUD=true`) |
|---|---|---|
| Feature resolution | License key on workspace | Plan record on workspace |
| Billing | Out-of-band (license activation) | Stripe integration (`/billing/*` endpoints) |
| Trials | Trial license keys | Plan-driven trials |
| Audit-log UI access | Owner-only, self-hosted-only | (Configurable) |
| License activation UI | Visible | Hidden |
| Billing UI | Hidden | Visible |
| Telemetry | Opt-out | Always on for service-health metrics |

## Plan registry

`LicenseCheckService.resolveFeatures()` consults a **plan registry** (in EE code) that maps Stripe plan IDs to feature sets:

```
plan-business-monthly    →  ['sso:google', 'sso:custom', 'mfa', 'api:keys', 'templates', ...]
plan-enterprise-annual   →  ['... business set ...', 'page:permissions', 'audit:logs', ...]
```

When a workspace's plan changes (Stripe webhook), the plan record updates and the next `entitlementAtom` refresh on the client picks it up.

## Stripe integration

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /billing/info` | Current subscription |
| `POST /billing/plans` | Available plans + prices |
| `POST /billing/checkout` | Returns Stripe Checkout URL |
| `POST /billing/portal` | Returns Stripe Customer Portal URL |

### Webhooks

Stripe webhooks land at a dedicated endpoint and are placed on `BILLING_QUEUE`. Handled events:

- `checkout.session.completed` → activate subscription
- `customer.subscription.updated` → update plan / status
- `customer.subscription.deleted` → downgrade
- `invoice.paid` → first-payment email (`FIRST_PAYMENT_EMAIL`)
- `customer.subscription.trial_will_end` → notify
- Trial expiry → `TRIAL_ENDED` job

Webhook signature is verified with `STRIPE_WEBHOOK_SECRET`.

### Seat counting

`STRIPE_SEATS_SYNC` job (on `BILLING_QUEUE`) periodically reconciles Stripe's seat count with the workspace's active member count. Discrepancies trigger an alert and (depending on policy) auto-correction.

## Required env vars

```
CLOUD=true
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_...
```

Plus the standard env (see [`./environment-variables.md`](./environment-variables.md)).

## Email

Cloud deployments typically use **Postmark** (or SES via the `smtp` driver). The `log` driver should never be used in cloud production.

## Storage

S3 (or S3-compatible) is required. Local storage doesn't survive instance restarts and breaks multi-replica deployments.

## AI providers

Cloud deployments default to managed OpenAI / Gemini providers. Per-workspace overrides allow customers to bring their own keys (BYOK) for compliance.

## Multi-tenancy guarantees

Every query the server runs is workspace-scoped. The cloud environment does not relax this — the same invariants that protect self-hosted single-tenant deployments are what isolate tenants in cloud:

- Every domain row has `workspace_id`.
- Every repo method takes `workspaceId` and filters on it.
- Every controller resolves the requester's workspace from the JWT and passes it through.
- Queries that lack a workspace filter are statically forbidden by code review (and tests assert this on critical paths).

## What we don't do in cloud (yet)

- Multi-region active-active. The single-cluster design works for moderate scale; multi-region is a future deployment topology, not a code change.
- Per-tenant database. All tenants share one Postgres cluster, isolated by `workspace_id`. The `database_url` per workspace is not currently a thing.

## Migrating self-hosted → cloud

Generally not a one-step process; involves data export, account creation, and re-import. Detailed runbook lives in operations docs (out of scope for this repo).

## Related

- Self-hosted deployment: [`./self-hosted.md`](./self-hosted.md)
- License model: [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md)
- Feature gating: [`../architecture/feature-gating.md`](../architecture/feature-gating.md)
- Admin billing UX: [`../admin/billing-and-license.md`](../admin/billing-and-license.md)
