# Status Codes Reference

Every enum-like status field used by the product, with allowed values.

## Page status

The `pages.status` field. Recommended/used values:

| Status | Meaning |
|---|---|
| `draft` | Created, not yet published |
| `published` | Visible per access rules |
| `in_review` | Submitted for review (when verification is enabled) |
| `approved` | QMS-approved |
| `verified` | Currently verified |
| `expiring` | Verification window is closing soon |
| `expired` | Verification expired — needs re-verification |
| `obsolete` | Explicitly marked as out of date |
| `archived` | Hidden from default listings |
| `deleted` | Soft-deleted (in trash) |

Not all values are produced in all flows — `in_review`, `approved`, `verified`, `expiring`, `expired`, and `obsolete` only appear when `Feature.PAGE_VERIFICATION` is active.

## Verification status

The `page_verifications.status` field. From the EE verification module:

```
draft  →  in_approval  →  approved  →  verified  →  expiring  →  expired
                          rejected                          →  obsolete
```

| Status | Meaning |
|---|---|
| `none` | No verification configured |
| `draft` | Draft — has not been submitted |
| `in_approval` | Submitted; awaiting verifier action |
| `approved` | Approved (QMS mode) |
| `rejected` | Rejected (QMS mode) — has a rejection_comment |
| `verified` | Verified and within its valid window |
| `expiring` | Within the pre-expiration warning window |
| `expired` | Past the expiration date |
| `obsolete` | Explicitly marked obsolete |

## Verification type

```ts
type VerificationType = 'expiring' | 'qms';
```

| Type | Meaning |
|---|---|
| `expiring` | Periodic re-verification — pages expire and must be re-verified on a cadence |
| `qms` | Quality Management System — author submits, designated verifier approves/rejects |

## Verification expiration mode

```ts
type ExpirationMode = 'period' | 'fixed' | 'indefinite';
```

| Mode | Meaning |
|---|---|
| `period` | Re-verify every N <unit> from last verification |
| `fixed` | Re-verify by a specific date |
| `indefinite` | No expiration (until manually re-verified) |

## Period unit

```ts
type PeriodUnit = 'day' | 'week' | 'month' | 'year';
```

## Workspace role

```ts
type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';
```

## Space role

```ts
type SpaceRole = 'admin' | 'writer' | 'reader';
```

## Page-permission role

```ts
type PagePermissionRole = 'reader' | 'writer';
```

## Auth provider type

```ts
type AuthProviderType = 'google' | 'saml' | 'oidc' | 'ldap';
```

## License type

```ts
type LicenseType = 'business' | 'enterprise';
```

## Tier

The full tier enum returned by `LicenseCheckService.resolveTier()`:

```ts
type Tier = 'free' | 'standard' | 'business' | 'enterprise';
```

`standard` exists in code but is not exposed in public pricing — used for grandfathered customers and trials.

## MFA method

```ts
type MfaMethod = 'totp' | 'email' | null;
```

`email` is reserved and not currently shipped.

## Audit actor type

```ts
type ActorType = 'user' | 'system' | 'api_key';
```

## Notification type

Notification types are defined as constants in the notification integration. See [`./notification-events.md`](./notification-events.md) for the full list.

## Storage driver

```
STORAGE_DRIVER = 'local' | 's3' | 'azure'
```

## Mail driver

```
MAIL_DRIVER = 'smtp' | 'postmark' | 'log'
```

## Search driver

```
SEARCH_DRIVER = 'pg' | 'typesense'
```

(`pg` is the default; `typesense` requires `Feature.SEARCH_TYPESENSE`-style entitlement and Typesense env vars.)

## File-task type

In-flight file workflow types (`file_tasks.type`):

- `import_confluence`
- `import_notion`
- `import_zip`
- `import_docx`
- `export_space`
- `export_pdf`

## File-task status

- `pending`
- `running`
- `completed`
- `failed`
- `cancelled`
