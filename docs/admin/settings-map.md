# Settings — what's where

The full map of the Settings sidebar with the *required role* and *feature flag* for each item. For the canonical structure that matches the code, see [`../reference/settings-sidebar.md`](../reference/settings-sidebar.md). This page reads it as a runbook for admins.

## Account (every user)

| Item | Notes |
|---|---|
| **Profile** | Name, avatar, email |
| **Preferences** | Theme, language, default landing page |
| **Security** | Password change, active sessions, sign-out other devices |
| **2FA / MFA** | Set up TOTP, backup codes — Business+ |
| **API Keys** | Personal API keys — Business+ |
| **Notifications** | Per-event delivery preferences |

## Workspace (admin)

### General
- Workspace name, slug, logo
- Default member role
- Timezone, default language

### Members
- Invite, deactivate, change role
- Pending invitations, resend, revoke

### Groups
- Create / rename / delete groups
- Group membership (manual or SCIM-synced)

### Spaces
- All workspace spaces with member count and visibility
- Bulk archive / delete

### Templates *(`Feature.TEMPLATES`)*
- Workspace-wide and space-scoped templates
- Restrict template creation to admins

### Public Sharing
- List of all active public links + spaces
- Disable public sharing workspace-wide *(`Feature.SHARING_CONTROLS`)*
- Per-space disable
- Branding-removal toggle *(Business+)*

### Security & SSO *(`Feature.SECURITY_SETTINGS`)*

Sub-pages:

| Sub-page | What it does |
|---|---|
| SSO providers | Configure Google / SAML / OIDC / LDAP |
| Enforce SSO | Block password login when SSO is enabled |
| Enforce MFA | Require all users to set up TOTP |
| Allowed email domains | Restrict signup |
| Session duration | Control JWT lifetime |
| Restrict template creation | Only admins create templates |
| Restrict exports | Only admins export pages / spaces |
| Trash retention | Auto-delete trashed pages after N days/months/years *(`Feature.RETENTION`, Enterprise)* |
| Audit-log retention | Auto-purge audit rows after N days/months/years *(`Feature.AUDIT_LOGS`)* |

### AI Settings *(`Feature.AI`, admin)*

| Sub-toggle | Effect |
|---|---|
| Generative AI (Ask AI) | Enables in-editor AI actions |
| AI Search | Enables `/ai/answers` semantic Q&A |
| AI Chat | Enables `/ai/chats/*` |
| MCP *(`Feature.MCP`)* | Enables `/mcp` endpoint |
| Provider | Choose OpenAI / Gemini / Ollama / OpenAI-compat |
| Models | Pick chat model and embedding model |

### Verified Pages *(`Feature.PAGE_VERIFICATION`)*

- All pages with verification configured
- Filters by status (verified / expiring / expired / in approval)
- Set workspace-default verification policy

### API Management *(`Feature.API_KEYS`, admin)*

- Workspace-level API keys
- Last-used, expiration, revoke

### Audit Log *(`Feature.AUDIT_LOGS`, owner, self-hosted only)*

- Filter by event, actor, date range, space
- Export (planned)
- Configure retention

### Analytics
- Workspace metrics (members, pages, public links, …)
- Drilldowns (planned)

### Billing *(cloud only, admin)*
- Current plan, seats, invoices
- Upgrade / downgrade / cancel
- Stripe customer portal link

## System (admin, self-hosted)

| Item | Notes |
|---|---|
| **License & Edition** | Activate / remove license, see active features |
| **Storage** | Storage driver, usage, S3 config |
| **Email** | Mail driver, send test email |
| **Search** | Search driver, reindex action |
| **Import / Export** | Active jobs, history, defaults |
| **Background Jobs** | Queue depths, failed-job count, recent jobs |
| **System Health** | Postgres + Redis health, version |

## Quick decision rules

- **"Why can I see / not see this?"** → Each item depends on (a) your role, (b) the workspace's feature flags. The lock-state UI explains both.
- **"Why is the toggle greyed out?"** → A required upstream toggle is off (e.g. AI Chat needs Generative AI on at the workspace level if your provider requires it).
- **"How do I change someone else's MFA?"** → You can't from this UI. Admin-reset MFA is on the roadmap; today it's a support / out-of-band action.

## Related

- Code-level mirror: [`../reference/settings-sidebar.md`](../reference/settings-sidebar.md)
- Architecture: [`../architecture/feature-gating.md`](../architecture/feature-gating.md)
