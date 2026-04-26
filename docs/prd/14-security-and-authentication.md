# PRD 14 — Security & Authentication

> **Source:** PA 14, lines 4607–4905. Architecture: [`../architecture/backend.md`](../architecture/backend.md) (Authentication section). Admin runbook: [`../admin/sso-and-mfa.md`](../admin/sso-and-mfa.md).

## Area overview

Authentication, SSO, MFA, and the broad set of security controls that constitute "Settings → Security & SSO".

## Epic 14.1 — Authentication

### Feature 14.1.1 — Email/password and JWT cookie

- Standard password authentication
- JWT cookie session token
- Bearer JWT for API clients
- Forgot / reset / change password flows
- Active sessions list per user (revokable)

**Acceptance.**
- Passwords hashed (bcrypt-class).
- Cookie marked `HttpOnly`, `Secure`, `SameSite=Lax`.
- Session timeouts configurable.

## Epic 14.2 — SSO

### Feature 14.2.1 — SSO providers

`Feature.SSO_GOOGLE` and `Feature.SSO_CUSTOM` (Business+).

**Providers.**

| Provider | Type | Required config |
|---|---|---|
| Google | OAuth 2.0 | Client ID, Client Secret |
| SAML | SAML 2.0 | SSO URL, Certificate |
| OIDC | OIDC | Issuer, Client ID, Client Secret |
| LDAP | LDAP/AD | URL, Bind DN, Bind password, Base DN, User search filter, optional TLS CA |

**Per-provider settings.**
- Enable / disable
- Allow signup (auto-provision new users)
- Group sync (some providers)
- Provider-specific attribute mapping

**Audit events.** `SSO_PROVIDER_CREATED`, `_UPDATED`, `_DELETED`.

### Feature 14.2.2 — Enforce SSO

When toggled on, password login is rejected. Users must SSO. Recommended posture for Enterprise.

## Epic 14.3 — Multi-Factor Authentication

`Feature.MFA` (Business+).

### Feature 14.3.1 — TOTP MFA

**Functional requirements.**
- TOTP setup (QR code + secret)
- Backup codes (one-time)
- Verify on login
- Disable
- Regenerate backup codes
- Enforce workspace-wide
- Admin-reset (planned)

**Audit events.** `USER_MFA_ENABLED`, `_DISABLED`, `_BACKUP_CODE_GENERATED`.

## Epic 14.4 — SCIM Provisioning

`Feature.SCIM` (Enterprise).

**Functional requirements.**
- Create / deactivate users from IdP
- Sync user attributes
- Sync groups (mapping IdP groups → workspace groups)
- Support Okta, Azure AD, Google Workspace, generic SCIM 2.0

## Epic 14.5 — API Keys

`Feature.API_KEYS` (Business+). See [`../admin/api-keys.md`](../admin/api-keys.md).

**Functional requirements.**
- Create / name / revoke
- Set expiration
- Track last-used
- Show token once
- User-level + workspace-level keys
- Restrict creation to admins (workspace policy)

## Epic 14.6 — Security Controls

`Feature.SECURITY_SETTINGS` (Business+ partial / Enterprise full).

**Settings.**
- Enforce SSO / MFA
- Allowed email domains
- Disable public sharing
- Restrict API key creation
- Restrict template creation
- Restrict exports
- Restrict AI usage
- Control external embeds
- Configure session duration
- Configure retention policies

## Cross-references

- Architecture: [`../architecture/backend.md`](../architecture/backend.md)
- Admin: [`../admin/sso-and-mfa.md`](../admin/sso-and-mfa.md), [`../admin/api-keys.md`](../admin/api-keys.md)
- Reference: [`../reference/api.md`](../reference/api.md) (Auth, MFA, SSO sections)
- Verbatim: [`../_legacy/product-requirements-user-stories-functional-spec.md`](../_legacy/product-requirements-user-stories-functional-spec.md)
