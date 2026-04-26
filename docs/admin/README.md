# Workspace administration

*Audience: Workspace owners, admins, knowledge managers, IT/security leads.*

How to operate a ConqrAI Wiki workspace day-to-day: who can do what, how to enforce SSO and MFA, how to issue API keys, how to read audit logs, how to control AI usage, and how billing works.

## Contents

### People & access
- [`users-and-groups.md`](./users-and-groups.md) — Inviting, deactivating, role assignment, SCIM provisioning, group management.
- [`sso-and-mfa.md`](./sso-and-mfa.md) — Configuring Google / SAML / OIDC / LDAP, enforcing SSO, TOTP MFA, backup codes, MFA enforcement.
- [`api-keys.md`](./api-keys.md) — User vs workspace keys, expiration, last-used tracking, MCP authentication.

### Compliance & governance
- [`audit-logs.md`](./audit-logs.md) — Reading the audit feed, filters, retention configuration. *Enterprise.*
- [`retention.md`](./retention.md) — Trash retention, audit-log retention, attachment retention. *Enterprise.*
- [`verification-policies.md`](./verification-policies.md) — QMS approval workflow vs expiring verification, designating verifiers, mark-obsolete. *Enterprise.*

### Content controls
- [`public-sharing.md`](./public-sharing.md) — Workspace-level vs space-level disable, branding removal, password protection, custom domain.
- [`ai-governance.md`](./ai-governance.md) — Enabling / disabling Generative AI, AI Search, AI Chat, MCP per workspace; choosing providers.

### Reference
- [`settings-map.md`](./settings-map.md) — Visual map of the entire Settings sidebar, with the feature flag and minimum role for each item.
- [`billing-and-license.md`](./billing-and-license.md) — Cloud (Stripe) flow, self-hosted license activation, seat counting, trial behavior.

## Quick role reference

| Role | Scope | Typical responsibilities |
|---|---|---|
| **Owner** | Workspace | License/billing, deletion, security policy, audit logs |
| **Admin** | Workspace | Users, groups, spaces, SSO, AI settings |
| **Knowledge Manager** | Workspace | Verification, templates, documentation health |
| **Space Admin** | Space | Members, settings, public sharing for that space |
| **Editor** | Page/space | Create + edit content |
| **Commenter** | Page/space | Read + comment |
| **Viewer** | Page/space | Read only |
| **Guest / External** | Selected | Limited access to specific spaces or shared pages |

Full matrix in [`../reference/permission-matrix.md`](../reference/permission-matrix.md).
