# PRD 22 — Integrations

> **Source:** PA 22, lines 5805–5976.

## Area overview

Three integration families: **productivity** (Slack, Teams, Drive, …), **developer** (GitHub, GitLab, …), and **automation** (webhooks, Zapier, n8n, MCP).

## Epic 22.1 — Productivity Integrations

### Feature 22.1.1 — Messaging

- **Slack** — page-update notifications, page mentions, command-line search of the wiki from Slack
- **Microsoft Teams** — same surface as Slack

### Feature 22.1.2 — Document sources

- **Google Drive** — link to Drive docs from a wiki page; preview inline
- **SharePoint** — same
- **Notion** (read) — link / embed
- **Confluence** (read) — link / embed (in addition to import)

### Feature 22.1.3 — Task tools

- **Jira / Linear / Asana / Trello** — link comments to tickets; bidirectional sync (planned)

## Epic 22.2 — Developer Integrations

### Feature 22.2.1 — Code hosting

- **GitHub / GitLab / Bitbucket** — auto-doc from PRs, link runbooks to repos, PR-comment driven doc updates

### Feature 22.2.2 — Observability / monitoring

- **Sentry** — link incidents to runbooks
- **Datadog** — link dashboards
- **PostHog** — feature analytics → docs that explain the feature

### Feature 22.2.3 — API specifications

- **OpenAPI** — auto-generate API documentation pages from a spec file

### Feature 22.2.4 — CI/CD

- Receive deploy events; auto-update release-notes pages

## Epic 22.3 — Automation Integrations

### Feature 22.3.1 — Webhooks

Per-workspace outgoing webhooks for: page created/updated/deleted, comment created, share created/revoked, audit events, verification events.

### Feature 22.3.2 — Zapier / Make / n8n

Adapters that wrap the REST API — for users without engineering resources.

### Feature 22.3.3 — Custom REST API

Already shipped — this is the foundation for everything else. See [`../reference/api.md`](../reference/api.md).

### Feature 22.3.4 — MCP

`Feature.MCP` (Enterprise). Shipped. The most powerful integration surface — exposes the wiki as a tool for any AI agent. See [`../reference/mcp-tools.md`](../reference/mcp-tools.md).

## Status

- **MCP** is shipped.
- **Webhooks**, **Slack/Teams notifications**, and the rest are roadmap items at varying stages.
- The REST API and API keys (the substrate for everything) are shipped.

## Cross-references

- API: [`../reference/api.md`](../reference/api.md)
- API keys: [`../admin/api-keys.md`](../admin/api-keys.md)
- MCP: [`../reference/mcp-tools.md`](../reference/mcp-tools.md)
