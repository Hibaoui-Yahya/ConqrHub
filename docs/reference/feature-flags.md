# Feature Flags Reference

The canonical list of all `Feature.*` constants — what each gates, which tier includes it, and where it's enforced.

**Source files:**
- Server: `apps/server/src/common/features.ts`
- Client: `apps/client/src/ee/features.ts`

For the gating mechanism, see [`../architecture/feature-gating.md`](../architecture/feature-gating.md).

| Constant | String | Tier | Gates | Notes |
|---|---|:---:|---|---|
| `Feature.SSO_GOOGLE` | `sso:google` | Business+ | Google OAuth provider | |
| `Feature.SSO_CUSTOM` | `sso:custom` | Business+ | SAML / OIDC / LDAP providers | |
| `Feature.MFA` | `mfa` | Business+ | TOTP MFA, backup codes, enforce-MFA | |
| `Feature.API_KEYS` | `api:keys` | Business+ | User + workspace API keys | Required for MCP |
| `Feature.COMMENT_RESOLUTION` | `comment:resolution` | Business+ | Resolve / reopen comments | |
| `Feature.PAGE_PERMISSIONS` | `page:permissions` | Enterprise | Per-page restriction + inheritance | Schema in core, enforcement in EE |
| `Feature.AI` | `ai` | Enterprise | Generative AI, AI Search, AI Chat | Per-surface workspace toggles also apply |
| `Feature.MCP` | `mcp` | Enterprise | `/mcp` endpoint | Requires `api:keys` |
| `Feature.SCIM` | `scim` | Enterprise | SCIM 2.0 provisioning | |
| `Feature.PAGE_VERIFICATION` | `page:verification` | Enterprise | Expiring + QMS verification | |
| `Feature.AUDIT_LOGS` | `audit:logs` | Enterprise | Audit log feed + retention | Self-hosted requires owner role to view |
| `Feature.RETENTION` | `retention` | Enterprise | Trash / data retention policies | |
| `Feature.SECURITY_SETTINGS` | `security:settings` | Business+ | Allowed domains, session length, restrict actions | Partial at Business, full at Enterprise |
| `Feature.SHARING_CONTROLS` | `sharing:controls` | Business+ | Disable public sharing | |
| `Feature.VIEWER_COMMENTS` | `comment:viewer` | Business+ | Viewers can comment | |
| `Feature.TEMPLATES` | `templates` | Business+ | Templates module | |
| `Feature.CONFLUENCE_IMPORT` | `import:confluence` | Business+ | Confluence ZIP import | |
| `Feature.DOCX_IMPORT` | `import:docx` | Business+ | Microsoft Word import | Uses `mammoth` lib in EE |
| `Feature.ATTACHMENT_INDEXING` | `attachment:indexing` | Business+ | Search inside PDF / DOCX attachments | |
| `Feature.PDF_EXPORT` | `export:pdf` | Business+ | Server-side PDF export | Requires Gotenberg |

## How tiers map to flags

The exact mapping lives in the plan registry (cloud) and the license-key generator (self-hosted), but the human-readable mapping is:

### Free / Community
*No flags.* Free users get the unflagged baseline.

### Business
- `sso:google`, `sso:custom`
- `mfa`
- `api:keys`
- `comment:resolution`, `comment:viewer`
- `templates`
- `sharing:controls`
- `security:settings` (partial — see [`security` PRD](../prd/14-security-and-authentication.md))
- `attachment:indexing`
- `import:confluence`, `import:docx`
- `export:pdf`

### Enterprise
Everything in Business **plus**:
- `page:permissions`
- `page:verification`
- `audit:logs`
- `retention`
- `ai`
- `mcp`
- `scim`

## Where a flag is checked

### Server
- Always at `LicenseCheckService.hasFeature(workspaceLicenseKey, Feature.X)`.
- Inside the controller / service that wraps the gated logic.
- Sometimes at module load time (rare — used to register or skip controllers).

### Client
- Through `useHasFeature('flag-string')` defined in `apps/client/src/ee/hooks/use-feature.ts`.
- Reads from the `entitlementAtom` (Jotai), populated from `POST /workspace/entitlements`.

## Adding a flag

See the recipe at the bottom of [`../architecture/feature-gating.md`](../architecture/feature-gating.md).

## Tier resolution

`LicenseCheckService.resolveTier()` returns one of `free | standard | business | enterprise`. The `standard` tier is **not exposed** in the public pricing page but is used internally for grandfathered customers and trials.
