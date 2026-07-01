# ConqrAI Wiki — Documentation

ConqrAI Wiki is an enterprise collaborative wiki and documentation platform — a hybrid of Confluence, Notion, GitBook, Guru, and a Glean-style AI knowledge layer, built as a NestJS + React monorepo on a Postgres / Redis / Hocuspocus stack.

This documentation set is split by **audience and depth**. Find your starting point below.

---

## The single document that defines everything

If you only read one file, read this. The complete platform definition — vision, every module, the full stack, architecture, AI subsystem, security, deployment, roadmap, and the long-horizon "knowledge OS" future — lives in [`conqra-hub-platform.md`](./conqra-hub-platform.md).

---

## I want to…

### …understand the product
- [`product/`](./product/README.md) — vision, personas, feature catalogue, plans, roadmap.
- [`glossary.md`](./glossary.md) — shared vocabulary used everywhere else.

### …understand how the system is built
- [`architecture/`](./architecture/README.md) — monorepo layout, backend, frontend, real-time, AI subsystem, search, EE submodule, feature gating.

### …work on the codebase
- [`engineering/`](./engineering/README.md) — getting started, repo tour, database/migrations, queues, testing, how to add a feature.

### …deploy, host, or run it
- [`deployment/`](./deployment/README.md) — self-hosted, cloud, air-gapped, environment variables, storage drivers, observability.

### …administer a workspace
- [`admin/`](./admin/README.md) — settings map, users/groups, SSO/MFA, API keys, audit logs, retention, AI governance, sharing, verification, billing/license.

### …look something up precisely
- [`reference/`](./reference/README.md) — REST API, MCP tools, feature flags, audit/notification events, queue jobs, database schema, editor extensions, settings sidebar, permission matrix, status codes.

### …find the formal product spec (PRDs, user stories, acceptance criteria)
- [`prd/`](./prd/README.md) — one file per Product Area (≈30 areas), each with epics, features, user stories, acceptance criteria, functional requirements, UX/UI requirements, technical notes, and test cases.

---

## Documentation map

```
docs/
├── README.md                    ← you are here
├── glossary.md                  Shared vocabulary
│
├── product/                     Product positioning & feature catalogue
│   ├── vision.md
│   ├── personas.md
│   ├── feature-catalogue.md
│   ├── plans-and-pricing.md
│   └── roadmap.md
│
├── architecture/                System design — how it's built
│   ├── overview.md
│   ├── backend.md
│   ├── frontend.md
│   ├── realtime-collaboration.md
│   ├── editor.md
│   ├── permissions-model.md
│   ├── ai-subsystem.md
│   ├── search-subsystem.md
│   ├── enterprise-edition.md
│   └── feature-gating.md
│
├── engineering/                 Day-to-day developer docs
│   ├── getting-started.md
│   ├── repository-layout.md
│   ├── database-and-migrations.md
│   ├── queues-and-jobs.md
│   ├── testing.md
│   └── adding-a-feature.md
│
├── deployment/                  Running it in production
│   ├── self-hosted.md
│   ├── cloud.md
│   ├── air-gapped.md
│   └── environment-variables.md
│
├── admin/                       Workspace administration
│   ├── settings-map.md
│   ├── users-and-groups.md
│   ├── sso-and-mfa.md
│   ├── api-keys.md
│   ├── audit-logs.md
│   ├── retention.md
│   ├── ai-governance.md
│   ├── public-sharing.md
│   ├── verification-policies.md
│   └── billing-and-license.md
│
├── reference/                   Code-grounded reference material
│   ├── api.md
│   ├── feature-flags.md
│   ├── audit-events.md
│   ├── notification-events.md
│   ├── queues-and-jobs.md
│   ├── database-schema.md
│   ├── editor-extensions.md
│   ├── mcp-tools.md
│   ├── permission-matrix.md
│   └── status-codes.md
│
├── prd/                         Detailed Product Requirements per Area
│   ├── 02-workspace-organization.md
│   ├── …                        (one file per Product Area, 02–34)
│   └── 34-decision-log.md
│
└── _legacy/                     Original monolithic documents (verbatim)
    ├── product-documentation.md
    ├── enterprise-features.md
    └── product-requirements-user-stories-functional-spec.md
```

---

## Conventions

- **Filenames** are kebab-case.
- **Paths in prose** use backticks: `apps/server/src/core/auth/`.
- **File references** include line numbers when pointing at a concrete location: `apps/server/src/common/features.ts:1`.
- **Audience tags** at the top of each doc: *Product / Architecture / Engineering / Admin / Reference / PRD*.
- **Tier badges** for gated features: `[Free]` `[Business+]` `[Enterprise]`.
- **Code reality** — when a section describes an aspirational feature not yet shipped, it is marked with **(planned)**. When a section is grounded in a specific file, that file is linked.

---

## License posture

The repository is dual-licensed:

- **Core (open source)** — AGPL-3.0. Everything outside the EE folders.
- **Enterprise Edition** — commercial license. Lives in:
  - `apps/server/src/ee/` — git submodule pointing at the private `docmost/ee` repo (empty in OSS clones).
  - `apps/client/src/ee/` — present in the repo, gated by feature flags + license check.
  - `packages/ee/` — license stub.

See [`architecture/enterprise-edition.md`](./architecture/enterprise-edition.md) for how EE modules are loaded dynamically and how feature gating works.

---

## How this documentation was assembled

This set was reorganized from three earlier monolithic documents (≈450 KB total) and grounded against the actual codebase. The originals are preserved verbatim in [`_legacy/`](./_legacy/) for traceability — every section has been redistributed into the new structure, but nothing was deleted.
