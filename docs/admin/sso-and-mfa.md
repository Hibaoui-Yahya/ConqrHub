# SSO and MFA

> **EE-only.** SSO providers (Google, SAML, OIDC, LDAP) and MFA (TOTP) are implemented in the EE submodule (`apps/server/src/ee/`). The OSS bundle ships only the JWT strategy. To deploy these features, build with the EE submodule pulled — see [`../deployment/self-hosted.md`](../deployment/self-hosted.md).

Configure Single Sign-On and Multi-Factor Authentication. Both are **Business+** features.

## SSO providers

Four supported provider types:

| Provider | Type | Required config |
|---|---|---|
| **Google** | OAuth 2.0 | Client ID, Client Secret |
| **SAML** | SAML 2.0 | SSO URL, Certificate |
| **OIDC** | OpenID Connect | Issuer URL, Client ID, Client Secret |
| **LDAP** | LDAP / Active Directory | URL, Bind DN, Bind Password, Base DN, User Search Filter |

Feature flags: `Feature.SSO_GOOGLE`, `Feature.SSO_CUSTOM` (covers SAML / OIDC / LDAP).

## Configuring a provider

**Settings → Security & SSO → SSO providers → Add provider**.

### Google

1. In Google Cloud Console, create an OAuth 2.0 Client.
2. Authorized redirect URI: `https://<your-host>/api/auth/google/callback`
3. Copy Client ID and Secret into ConqrAI.
4. Set `Allow signup` if new users should be auto-provisioned on first SSO login.
5. Enable.

### SAML

1. Get your IdP's SSO URL and signing certificate.
2. Set them in the provider form.
3. Configure the IdP's ACS URL: `https://<your-host>/api/auth/saml/<provider-id>/callback`.
4. Map IdP attributes (email, name, group memberships).
5. Enable.

### OIDC

1. Create an OIDC application in your IdP (Auth0, Keycloak, Okta, …).
2. Redirect URI: `https://<your-host>/api/auth/oidc/<provider-id>/callback`.
3. Copy Issuer URL, Client ID, Client Secret.
4. Enable.

### LDAP / Active Directory

1. Provide URL (`ldap://...` or `ldaps://...`), Bind DN, Bind Password.
2. Set Base DN and User Search Filter.
3. Optionally enable TLS and provide CA cert for self-signed.
4. Test the connection.
5. Enable.

For all four, audit events fire on changes: `SSO_PROVIDER_CREATED`, `_UPDATED`, `_DELETED`.

## Allow signup

For each provider you can independently toggle `allowSignup`:

- **On** — first-time SSO logins create a workspace member with the default role.
- **Off** — only existing members can SSO in; new users see "user not found".

## Group sync

(Some providers) — toggle `groupSync` to map IdP groups to workspace groups. Mapping rules live in the provider record.

## Enforcing SSO

**Settings → Security & SSO → Enforce SSO** — when enabled:

- Password login is rejected.
- All members must authenticate via the configured provider(s).
- Owners (or a designated emergency-access account) can keep password login as a fallback (depending on policy).

Set this *after* you've validated SSO works for at least one Owner — otherwise you can lock yourself out.

---

## MFA (Multi-Factor Authentication)

`Feature.MFA` (Business+). Implemented as TOTP (Google Authenticator, 1Password, Authy, etc.) with backup codes.

### Per-user setup

**Settings → Account → Security → 2FA → Enable**.

1. Scan the QR code with an authenticator app.
2. Enter the 6-digit code to confirm.
3. Save the **backup codes** somewhere safe — each works once.

### Login with MFA

After password / SSO success, the user is prompted for the 6-digit code (or a backup code). The code is verified server-side.

### Backup codes

- 8 codes by default
- Each can be used once
- Regenerate from **Settings → Account → Security → 2FA → Regenerate backup codes**
- Audit event: `USER_MFA_BACKUP_CODE_GENERATED`

### Disable

**Settings → Account → Security → 2FA → Disable**. Audit event: `USER_MFA_DISABLED`.

### Enforcing MFA workspace-wide

**Settings → Security & SSO → Enforce MFA** — when enabled:

- All users see a setup-required page on next login until they've configured MFA.
- New users must set up MFA during onboarding.

## Recovery

If a user loses both their authenticator and backup codes:

- **Today:** out-of-band recovery — admin support process. There is no admin-reset-MFA UI yet.
- **Roadmap:** admin-reset-MFA UI with full audit trail and (optionally) re-verification step.

## Combined: Enforce SSO + Enforce MFA

This is the recommended posture for Enterprise:

1. Set up SSO providers and validate.
2. Enable Enforce SSO.
3. (Optional) If your IdP itself enforces MFA, you can rely on that and leave Enforce-MFA off.
4. Otherwise enable Enforce MFA so the second factor lives at the wiki layer.

## Audit events to watch

- `SSO_PROVIDER_CREATED` / `_UPDATED` / `_DELETED`
- `USER_MFA_ENABLED` / `_DISABLED` / `_BACKUP_CODE_GENERATED`
- `USER_LOGIN` / `_LOGOUT`
- `USER_PASSWORD_CHANGED` / `_RESET`

See [`./audit-logs.md`](./audit-logs.md) for filtering.

## Related

- Permission matrix: [`../reference/permission-matrix.md`](../reference/permission-matrix.md)
- API reference (auth & MFA endpoints): [`../reference/api.md`](../reference/api.md)
- Architecture: [`../architecture/backend.md`](../architecture/backend.md) (Authentication section)
