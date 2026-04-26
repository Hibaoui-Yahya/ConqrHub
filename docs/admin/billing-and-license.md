# Billing & License

Two paths depending on deployment mode:

- **Cloud** — Stripe-managed subscriptions, `/billing/*` endpoints.
- **Self-hosted** — License keys, `/license/*` endpoints.

## Cloud (Stripe)

`CLOUD=true` in env. Workspace owners and admins manage billing.

### Settings → Billing

| Section | What |
|---|---|
| **Current plan** | Tier, seat count, renewal date |
| **Upgrade / downgrade** | Choose plan, redirect to Stripe Checkout |
| **Customer portal** | Stripe-hosted portal for invoices, payment methods, cancellation |
| **Trial banner** | If on trial, days remaining |

### Plan changes

- **Upgrade** — Stripe charges prorated, entitlements take effect within seconds (next `entitlementAtom` refresh on the client).
- **Downgrade** — takes effect at next renewal.
- **Cancel** — workspace continues until renewal, then drops to free tier (paid features lock).

### Webhook flow

```
Stripe event
   │
   ▼
POST /billing/webhook   (signature verified with STRIPE_WEBHOOK_SECRET)
   │
   ▼
BILLING_QUEUE job
   │
   ▼
Update plan record on workspace
   │
   ▼
Next request from any client → entitlements re-fetched → UI updates
```

Handled events:

- `checkout.session.completed` → activate subscription
- `customer.subscription.updated` → update plan / status
- `customer.subscription.deleted` → downgrade
- `invoice.paid` → first-payment email
- `customer.subscription.trial_will_end` → notification

### Seat counting

`STRIPE_SEATS_SYNC` job runs periodically to reconcile Stripe seat count with the workspace's active member count. Discrepancies alert admins.

## Self-hosted (license keys)

`CLOUD` unset or `false`. Owner manages license.

### Settings → License & Edition

| Section | What |
|---|---|
| **Current license** | Customer name, seat count, license type, issued/expires dates, trial flag |
| **Active features** | List of `Feature.*` strings the license includes |
| **Activate** | Paste a license key, validate, save |
| **Remove** | Revert to free tier |

### Activating a license

1. Acquire a license key from your account contact.
2. **Settings → License & Edition → Activate License**.
3. Paste the key, click **Validate**.
4. The server verifies the signature with `LICENSE_PUBLIC_KEY`. Valid → license is saved on the workspace and entitlements update immediately.

Audit event: `LICENSE_ACTIVATED`.

### License model

```ts
interface ILicenseInfo {
  id: string;
  customerName: string;
  seatCount: number;
  licenseType: 'business' | 'enterprise';
  issuedAt: string;
  expiresAt: string;
  trial: boolean;
}
```

### Trial

Trial keys are signed with a short expiry (typically 14 / 30 days). When they expire, the workspace falls back to free tier — paid features lock but data is preserved.

To extend a trial: get a new key from sales and re-activate.

### Air-gapped

License validation is **fully offline** — only the public key is required. See [`../deployment/air-gapped.md`](../deployment/air-gapped.md).

### Removing a license

**Settings → License & Edition → Remove**. Audit event: `LICENSE_REMOVED`.

After removal:
- Paid features lock immediately.
- Existing data is preserved.
- A new license can be activated at any time.

## Combined behavior

Cloud and self-hosted are **mutually exclusive deployment modes**. You don't see both UI sections in the same workspace:

- Cloud workspaces show **Billing**, hide **License & Edition**.
- Self-hosted workspaces show **License & Edition**, hide **Billing**.

The codebase determines which path is active via `CLOUD` env var; the client reads `entitlement.cloud` and shows the correct UI.

## Lock-state UX

When a feature is locked, the upgrade label adapts:

| Context | Label |
|---|---|
| Cloud, free | *Upgrade your plan* |
| Cloud, paid (missing this feature) | *Upgrade your plan* |
| Self-hosted, free | *Available with a paid license* |
| Self-hosted, paid (missing this feature) | *Upgrade your license tier* |

## Audit

- `LICENSE_ACTIVATED` / `LICENSE_REMOVED` (self-hosted)
- (Cloud subscription changes are visible in the Stripe dashboard rather than the audit log)

## API endpoints

### License (self-hosted)
```
POST /license/info       Get current license
POST /license/activate   Activate with key
POST /license/remove     Remove license
```

### Billing (cloud)
```
POST /billing/info       Subscription
POST /billing/plans      Available plans
POST /billing/checkout   Stripe Checkout URL
POST /billing/portal     Stripe Customer Portal URL
```

See [`../reference/api.md`](../reference/api.md).

## Related

- License model architecture: [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md)
- Feature gating: [`../architecture/feature-gating.md`](../architecture/feature-gating.md)
- Cloud deployment: [`../deployment/cloud.md`](../deployment/cloud.md)
- Self-hosted deployment: [`../deployment/self-hosted.md`](../deployment/self-hosted.md)
- Plans and pricing: [`../product/plans-and-pricing.md`](../product/plans-and-pricing.md)
