# Feature Catalogue

A flat, scannable index of every product capability. Use this as a "where does X live" map. Tier badges:

- `[Free]` — Community, included in OSS / self-host
- `[Business+]` — Business and Enterprise
- `[Enterprise]` — Enterprise only
- `(planned)` — described in product spec, not yet implemented

For the feature-flag string and gating mechanism, see [`../reference/feature-flags.md`](../reference/feature-flags.md).

---

## Workspace

| Feature | Tier | Notes |
|---|---|---|
| Workspace creation, branding, default settings | Free | |
| Member invitations, role assignment | Free | |
| Workspace health dashboard *(metrics: users, pages, public links, AI usage, …)* | Free + extended at Business+/Enterprise | Some metrics depend on Audit (Enterprise). |
| Allowed-email-domain restriction | Business+ | |
| Brand removal on public pages | Business+ | |

## Spaces

| Feature | Tier | Notes |
|---|---|---|
| Create / edit / archive / delete spaces | Free | |
| Space types: public-internal, private, restricted, public-docs | Free | Some access modes require permission features |
| Space templates | Business+ | Feature flag `TEMPLATES` |
| Space export | Free (MD / HTML) / Business+ (PDF, DOCX) | |
| Space-level public sharing portal | Business+ | |

## Pages

| Feature | Tier | Notes |
|---|---|---|
| Create / edit / publish / draft / autosave / rename / move / copy / duplicate / delete / restore | Free | |
| Page metadata: icon, cover, owner, tags, status | Free | |
| Page tree (drag-drop, hierarchy, indicators) | Free | |
| Page-level granular permissions | Enterprise | Feature flag `PAGE_PERMISSIONS` |
| Page verification (expiring + QMS) | Enterprise | Feature flag `PAGE_VERIFICATION` |
| Mark obsolete | Enterprise | Part of verification workflow |

## Editor

| Feature | Tier | Notes |
|---|---|---|
| Rich text + block editor (Tiptap) | Free | |
| Slash commands, drag handle, bubble toolbar | Free | |
| Code, math, tables, callouts, embeds | Free | |
| Mermaid, Draw.io, Excalidraw diagrams | Free | |
| Tabs, columns, toggle/accordion | Free | |
| Technical-doc blocks: API endpoint, DB schema, runbook, ADR | (planned) | Architecture spec; not all blocks are shipped yet |
| AI editor actions (improve, summarize, translate, …) | Enterprise | Feature flag `AI` |
| Comment marks (resolve / reopen) | Business+ | Feature flag `COMMENT_RESOLUTION` |

## Collaboration

| Feature | Tier | Notes |
|---|---|---|
| Real-time co-editing (Hocuspocus + Yjs) | Free | |
| Live cursors / presence | Free | |
| Inline + page comments, replies, mentions | Free | |
| Resolve / reopen comments | Business+ | |
| Viewer comments (read-only users can comment) | Business+ | Feature flag `VIEWER_COMMENTS` |
| Notifications: in-app, email | Free | |
| Notifications: Slack, Teams, webhooks | (planned) | |

## Search

| Feature | Tier | Notes |
|---|---|---|
| Full-text search (Postgres `tsvector` + `unaccent`) | Free | |
| Search suggestions | Free | |
| Filters (space, author, owner, tag, date, status) | Free + extended at Business+ | |
| Typesense driver | Business+ | |
| Attachment indexing (PDF, DOCX) | Business+ | Feature flag `ATTACHMENT_INDEXING` |
| AI Search (AI Answers with citations) | Enterprise | Feature flag `AI` |
| Permission-aware filtering on every result type | Free | Built into the search layer, not a separate feature |

## AI

| Feature | Tier | Notes |
|---|---|---|
| Editor AI Assistant (Ask AI) | Enterprise | Feature flag `AI` + workspace toggle `ai.generative` |
| AI Search / AI Answers | Enterprise | Workspace toggle `ai.search` |
| AI Chat (multi-turn, page mentions, file uploads, tool calling) | Enterprise | Workspace toggle `ai.chat` |
| MCP server endpoint | Enterprise | Feature flag `MCP`, workspace toggle `ai.mcp` |
| Knowledge gap detection | (planned) | Architecture exists in spec; not shipped |
| Documentation Health score | (planned) | Architecture exists in spec; not shipped |
| AI governance (per-workspace toggles, providers, retention) | Enterprise | |

## Permissions

| Feature | Tier | Notes |
|---|---|---|
| Workspace roles (Owner / Admin / Member / Guest) | Free | |
| Groups (assign to spaces, sync from SSO) | Free | |
| Space roles (Admin / Writer / Reader) | Free | |
| Page-level granular permissions + inheritance | Enterprise | |
| Access explanation UI | Enterprise | |
| Access requests | (planned) | |

## Public sharing

| Feature | Tier | Notes |
|---|---|---|
| Per-page public link | Business+ | |
| Password-protected links, expiration | Business+ | |
| Space-level public docs portal | Business+ | |
| Custom domain | Business+ | |
| Disable public sharing (workspace / space) | Business+ | Feature flag `SHARING_CONTROLS` |
| Audit all sharing events | Enterprise | |

## Security & Authentication

| Feature | Tier | Notes |
|---|---|---|
| Email/password auth | Free | |
| JWT cookie sessions | Free | |
| Google OAuth | Business+ | Feature flag `SSO_GOOGLE` |
| SAML 2.0 | Business+ | Feature flag `SSO_CUSTOM` |
| OIDC | Business+ | Feature flag `SSO_CUSTOM` |
| LDAP / Active Directory | Business+ | Feature flag `SSO_CUSTOM` |
| Multi-factor auth (TOTP + backup codes) | Business+ | Feature flag `MFA` |
| Enforce SSO / MFA workspace-wide | Business+ | |
| SCIM provisioning | Enterprise | Feature flag `SCIM` |
| API keys (user + workspace) | Business+ | Feature flag `API_KEYS` |

## Compliance

| Feature | Tier | Notes |
|---|---|---|
| Audit logs (22 event categories) | Enterprise | Feature flag `AUDIT_LOGS` |
| Audit-log retention | Enterprise | |
| Trash / data retention | Enterprise | Feature flag `RETENTION` |
| Page verification + approval workflow | Enterprise | |
| Security controls (allowed domains, restrict exports, restrict templates, …) | Business+ partial / Enterprise full | Feature flag `SECURITY_SETTINGS` |
| Air-gapped deployment | Business+ | |

## Import / Export

| Feature | Tier | Notes |
|---|---|---|
| Markdown / HTML import | Free | |
| Markdown / HTML export | Free | |
| Notion import | Business+ | |
| Confluence import | Business+ | Feature flag `CONFLUENCE_IMPORT` |
| DOCX import | Business+ | Feature flag `DOCX_IMPORT` |
| PDF export | Business+ | Feature flag `PDF_EXPORT`, requires Gotenberg |
| Bulk ZIP import | Business+ | |
| Full space / workspace export | Business+ | |

## Templates

| Feature | Tier | Notes |
|---|---|---|
| Workspace-level templates | Business+ | |
| Space-scoped templates | Business+ | |
| Search & categorize templates | Business+ | |
| Restrict template creation to admins | Business+ | |
| AI-generated templates | (planned) | |

## Diagrams & visual

| Feature | Tier | Notes |
|---|---|---|
| Mermaid | Free | |
| Draw.io | Free | |
| Excalidraw | Free | |
| AI-generated diagrams | (planned) | |
| Diagram versioning with page history | Free | Limited — see PRD §19 |

## Version history

| Feature | Tier | Notes |
|---|---|---|
| Page revisions, view list, restore | Free | |
| Diff between versions | Free | |
| Restore deleted pages from trash | Free | |
| Trash retention policy | Enterprise | |

## Analytics

| Feature | Tier | Notes |
|---|---|---|
| Workspace dashboard metrics | Free + extended Enterprise | |
| Page analytics (views, viewers, read time) | (planned) | |
| Space analytics | (planned) | |
| AI analytics (questions asked, sources used, cost) | Enterprise | Linked to AI features |

## Documentation Health

| Feature | Tier | Notes |
|---|---|---|
| Health score 0–100 | (planned) | |
| Health categories (outdated, missing owners, broken links, …) | (planned) | |
| Recommended actions | (planned) | |

## Integrations

| Feature | Tier | Notes |
|---|---|---|
| Slack / Teams / Google Drive / SharePoint / Notion / Confluence / Jira / Linear / Asana / Trello | Mix of (planned) and (partial) | See PRD §22 |
| GitHub / GitLab / Bitbucket / Sentry / Datadog / PostHog / OpenAPI / CI-CD | (planned) | |
| Webhooks / Zapier / Make / n8n | (planned) | |
| MCP | Enterprise | Implemented |

## Plans & Licensing

| Feature | Tier | Notes |
|---|---|---|
| Cloud subscription via Stripe | Cloud only | |
| Self-hosted license activation | Self-hosted | |
| Trial licenses | Cloud + self-hosted | |
| Plan-based feature resolution (cloud) | Cloud only | Bypasses license keys |
| License-key feature resolution (self-hosted) | Self-hosted | |

## Deployment

| Feature | Tier | Notes |
|---|---|---|
| Self-hosted (Docker / Docker-Compose) | Free | |
| Cloud (managed) | Cloud only | |
| Air-gapped | Business+ | |
| Standalone collaboration server | Free | `pnpm collab:dev` / `pnpm collab:prod` |

---

## Note on `(planned)` items

Items marked `(planned)` are described in detail in [`../prd/`](../prd/README.md). They represent the *target* product. The current implementation reality is described in [`../architecture/`](../architecture/README.md) and the formal flag list in [`../reference/feature-flags.md`](../reference/feature-flags.md).
