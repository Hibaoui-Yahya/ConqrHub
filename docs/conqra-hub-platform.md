# Conqra Hub — Complete Platform Definition

> *Audience: Product, Architecture, Engineering, Admin, Reference, Strategy*
> *Status: living document — superset of everything in `docs/product/`, `docs/architecture/`, `docs/prd/` and `docs/reference/`*
> *Today's date: 2026-05-20*

---

## 0. Document Map

1. [Executive Summary](#1-executive-summary)
2. [Vision & Mission](#2-vision--mission)
3. [The Hub Model — Product Surface](#3-the-hub-model--product-surface)
4. [Personas & Use Cases](#4-personas--use-cases)
5. [Editions, Plans & Licensing](#5-editions-plans--licensing)
6. [Module Catalogue (Everything Conqra Hub Does)](#6-module-catalogue-everything-conqra-hub-does)
7. [Technology Stack — Top to Bottom](#7-technology-stack--top-to-bottom)
8. [System Architecture](#8-system-architecture)
9. [Data Model](#9-data-model)
10. [AI Subsystem — Deep Dive](#10-ai-subsystem--deep-dive)
11. [Real-Time Collaboration](#11-real-time-collaboration)
12. [Search Subsystem](#12-search-subsystem)
13. [Permissions, Roles, Sharing](#13-permissions-roles-sharing)
14. [Security, Authentication & Compliance](#14-security-authentication--compliance)
15. [Integrations & Extensibility](#15-integrations--extensibility)
16. [MCP — The Agentic Layer](#16-mcp--the-agentic-layer)
17. [Deployment Models & Infrastructure](#17-deployment-models--infrastructure)
18. [Operations, Observability & SLOs](#18-operations-observability--slos)
19. [Non-Functional Requirements](#19-non-functional-requirements)
20. [Quality, Testing & Release Engineering](#20-quality-testing--release-engineering)
21. [Roadmap — Now / Next / Later](#21-roadmap--now--next--later)
22. [The Future — Conqra Hub as a Knowledge OS](#22-the-future--conqra-hub-as-a-knowledge-os)
23. [Glossary](#23-glossary)

---

## 1. Executive Summary

**Conqra Hub is the unified knowledge and intelligence platform for modern organizations.** It is the umbrella product that contains and extends what today ships as *ConqrAI Wiki*, plus every adjacent capability the company has built or planned: AI chat, AI search, meeting intelligence, expert insights, document-health analytics, MCP-based agent integration, and a programmable knowledge graph.

Where most tools occupy a single category — a wiki, a chatbot, a search bar, a meeting recorder — Conqra Hub is built to be the **operational brain** for a company. People, documents, conversations, decisions, processes, and AI agents converge into one governed, permission-aware, audit-grade workspace.

The platform is built as a **NestJS + React monorepo** with PostgreSQL, Redis, Hocuspocus (Yjs), Tiptap, Typesense, BullMQ, S3-compatible storage, and a pluggable AI provider layer (OpenAI, Anthropic, Azure OpenAI, Mistral, local LLMs, etc.) plus pgvector / Qdrant for retrieval.

Conqra Hub ships in three editions — **Free (OSS, AGPL-3.0)**, **Business** (commercial), **Enterprise** (commercial + air-gapped + governance) — across self-hosted, managed cloud, and air-gapped deployment models.

**One question drives the product:**

> *Can our people find the right trusted knowledge at the right time, and can we prove that this knowledge is accurate, governed, and up to date?*

Everything else — the editor, the chat, the audit log, the verification workflow, the meeting summarizer, the MCP server, the agents — exists in service of that question.

---

## 2. Vision & Mission

### 2.1 Vision

> *Conqra Hub is the trusted company brain — a place where people, processes, data, and AI work together to preserve expertise, accelerate onboarding, reduce repeated questions, and improve every decision an organization makes.*

### 2.2 Mission

- **Centralize** scattered knowledge from docs, chats, meetings, code, and tools.
- **Govern** that knowledge with permissions, verification, audit, retention, and approval workflows.
- **Augment** every user with cited AI answers, in-editor assistance, and agent integration.
- **Continuously improve** the knowledge base by detecting gaps, contradictions, drift, and decay.
- **Operationalize** knowledge — let pages, runbooks, and decisions drive workflows, not just describe them.

### 2.3 Differentiation pillars

1. **AI-powered knowledge discovery** — natural-language Q&A with citations.
2. **Human-in-the-loop validation** — experts annotate, correct, vote, and verify AI output.
3. **Documentation governance** — verification states, formal review/approval workflows, retention controls, audit logs.
4. **Documentation-health intelligence** — proactive detection of outdated, missing, duplicated, and weak content.
5. **Technical-documentation depth** — first-class blocks for APIs, schemas, runbooks, ADRs, diagrams.
6. **Enterprise readiness** — SSO (SAML/OIDC/LDAP), MFA, SCIM, audit logs, air-gapped deployment, granular permissions.
7. **Agentic surface** — every workspace action is an MCP tool; AI agents can read, write, search, and refactor knowledge under permission and audit.

### 2.4 Strategic identity

Conqra Hub is positioned as a hybrid of several adjacent products — and intentionally replaces all of them:

| Category | What Conqra Hub takes from it |
|---|---|
| **Confluence** | Structured company documentation, spaces, hierarchy, governance |
| **Notion** | Flexible collaborative writing, block-based editor, real-time co-edit |
| **GitBook** | Polished product and technical documentation portals |
| **Guru** | Verified-knowledge management and trust signals |
| **Glean** | AI search across enterprise knowledge with citations |
| **Otter / Fathom / Read.ai** | Meeting capture, transcription, summarization |
| **GitHub Copilot / Cursor** | In-context AI assistance, but for knowledge instead of code |
| **Slack/Teams AI assistants** | Chat-grounded answers — but on real, governed sources |
| **MCP servers (Linear, Notion, Confluence, etc.)** | Conqra Hub *is* the MCP server for company knowledge |

Conqra Hub is the **single platform an organization standardizes on for all knowledge that matters**.

---

## 3. The Hub Model — Product Surface

Conqra Hub is organized as a **Hub of capability planes** sitting on a shared workspace foundation:

```
┌───────────────────────────────────────────────────────────────────────┐
│                         Conqra Hub (workspace)                        │
│                                                                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │  Wiki &     │ │  AI         │ │  Meeting    │ │  Knowledge  │      │
│  │  Documents  │ │  Knowledge  │ │  Intelli-   │ │  Health &   │      │
│  │  (Spaces,   │ │  (Chat,     │ │  gence      │ │  Insights   │      │
│  │   Pages,    │ │   Search,   │ │  (STT, AI   │ │  (Verif.,   │      │
│  │   Editor)   │ │   RAG, MCP) │ │   summary)  │ │   Health)   │      │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│  │  Public     │ │  Templates  │ │  Expert     │ │  Agents &   │      │
│  │  Portals    │ │  & Standards│ │  Network    │ │  Workflows  │      │
│  │  (Docs site,│ │             │ │  (HITL,     │ │  (planned)  │      │
│  │   Sharing)  │ │             │ │   voting)   │ │             │      │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘      │
│                                                                       │
│  ─── Shared foundation ────────────────────────────────────────────   │
│  Identity • Permissions • Audit • Search • Storage • Notifications    │
│  Real-time (Hocuspocus + Yjs) • Queue (BullMQ) • Telemetry            │
└───────────────────────────────────────────────────────────────────────┘
```

Every plane reuses the same identity, permission model, audit trail, search index, and notification surface. There is exactly one workspace concept, one user concept, one permission graph.

---

## 4. Personas & Use Cases

### 4.1 Primary personas

| Persona | Role | Top jobs in Conqra Hub |
|---|---|---|
| **Workspace Admin** | IT / Platform owner | SSO, SCIM, audit, retention, billing, license, AI governance |
| **Space Admin / Owner** | Department or team lead | Manage spaces, permissions, templates, verification cadence |
| **Knowledge Author** | Tech writer, PM, SME | Write/edit pages, embed diagrams, link tickets, verify accuracy |
| **Reader / Searcher** | Anyone in the org | Find answers via search and AI chat, request access |
| **Verifier / Approver** | SMEs, QMS reviewers | Verify pages, approve drafts, sign off on regulated content |
| **External Reader** | Customers, partners | Read public portals, request access, react to public docs |
| **Compliance Officer** | Legal, Security, QA | Audit logs, retention enforcement, evidence packs |
| **AI Operator** | DevRel, AI champion | Configure providers, tune retrieval, monitor cost/quality |
| **AI Agent** *(programmatic)* | External LLM via MCP | Read, write, search, comment under scoped credentials |

### 4.2 Target customers

- SaaS companies replacing Confluence + Notion + a chatbot
- Consulting firms running client-deliverable docs
- Engineering organizations with runbooks, ADRs, incident postmortems
- Industrial / aerospace / automotive teams with regulatory documentation
- Customer support orgs maintaining KBs
- HR and operations teams onboarding employees
- Regulated organizations (life sciences, finance, defense) needing approval workflows and air-gapped deployment

### 4.3 Hero use cases

1. **"Where is the answer?"** — Reader asks AI Chat; gets a cited answer drawn from current pages, attachments, and meeting notes; trusts because every claim links to a verified source.
2. **"Is this still true?"** — Author opens a page; sees its verification status, last verifier, owner, link health, and freshness; can request reverification.
3. **"Let me record the kickoff"** — Meeting Intelligence captures audio, transcribes, summarizes, generates a structured kickoff page bound to the project space.
4. **"Reconcile the spec"** — AI agent (Claude, ChatGPT, internal copilot) connects via MCP and reads scoped pages and comments, proposes edits via tools, all under audit.
5. **"Replace our old wiki"** — Admin imports Confluence + Notion + GitBook + Google Docs through bulk import jobs, with permission inference and link rewriting.
6. **"Ship the docs site"** — Marketing or product enables a public portal for a space with a custom domain, password protection, expiry, and brand removal.
7. **"Onboard a new hire"** — Role-aware reading paths surface critical pages; HITL checkpoints validate comprehension; AI assistant answers follow-up questions with citations.

---

## 5. Editions, Plans & Licensing

### 5.1 Edition matrix

| Capability | Free (OSS, AGPL-3.0) | Business | Enterprise |
|---|---|---|---|
| Core wiki, editor, real-time, search, comments | ✅ | ✅ | ✅ |
| Spaces, page tree, history, trash | ✅ | ✅ | ✅ |
| Markdown / HTML import & export | ✅ | ✅ | ✅ |
| Diagrams (Mermaid, Draw.io, Excalidraw) | ✅ | ✅ | ✅ |
| SSO (Google, SAML, OIDC, LDAP) | — | ✅ | ✅ |
| MFA (TOTP + backup codes) | — | ✅ | ✅ |
| API keys (user + workspace) | — | ✅ | ✅ |
| Comment resolution | — | ✅ | ✅ |
| Viewer comments | — | ✅ | ✅ |
| Templates | — | ✅ | ✅ |
| Confluence / Notion / DOCX / PDF import | — | ✅ | ✅ |
| PDF export (via Gotenberg) | — | ✅ | ✅ |
| Public portals (links, password, expiry, custom domain) | — | ✅ | ✅ |
| Attachment indexing (PDF, DOCX) | — | ✅ | ✅ |
| Typesense search driver | — | ✅ | ✅ |
| Air-gapped deployment | — | ✅ | ✅ |
| SCIM provisioning | — | — | ✅ |
| AI Editor Assistant + AI Chat + AI Search | — | — | ✅ |
| MCP server | — | — | ✅ |
| Meeting Intelligence (STT + summary) | — | — | ✅ |
| Expert Insights (HITL) | — | — | ✅ |
| Documentation Health Center | — | — | ✅ |
| Page Verification (expiring + QMS) | — | — | ✅ |
| Page-level granular permissions | — | — | ✅ |
| Audit logs (22 event categories) | — | — | ✅ |
| Retention policies (trash + audit) | — | — | ✅ |
| AI governance (provider routing, budgets, exclusions) | — | — | ✅ |

### 5.2 Licensing model

- **Self-hosted Free / Business / Enterprise** — license key + feature flag resolver.
- **Cloud** — Stripe subscription, plan → feature mapping bypasses license keys.
- **Trials** — short-lived license / plan for both modes.
- **License resolution path** — `apps/server/src/common/features.ts` + the `licence` EE module.

### 5.3 License posture

- **Core** is AGPL-3.0 (everything outside `apps/{server,client}/src/ee/` and `packages/ee/`).
- **Enterprise Edition** is commercial. Source lives under `apps/server/src/ee/`, `apps/client/src/ee/`, `packages/ee/`. The server EE module is loaded *dynamically* (`require('./ee/ee.module')`) so the OSS build runs without it.

---

## 6. Module Catalogue (Everything Conqra Hub Does)

Every module is listed here in one place. Each links back to the deep-dive elsewhere in this document.

### 6.1 Workspace

- Workspace creation, branding, default settings
- Member invitations, role assignment (Owner / Admin / Member / Guest)
- Allowed-email-domain restriction *(Business+)*
- Workspace health dashboard (users, pages, public links, AI usage)
- Brand removal on public pages *(Business+)*

### 6.2 Spaces

- Create / edit / archive / delete
- Space types: `public-internal`, `private`, `restricted`, `public-docs`
- Space roles: Admin / Writer / Reader
- Space templates *(Business+)*
- Space export — MD / HTML (Free), PDF / DOCX *(Business+)*
- Space-level public-docs portal *(Business+)*

### 6.3 Pages

- Create / edit / publish / draft / autosave / rename / move / copy / duplicate / delete / restore
- Rich metadata: icon, cover, owner, tags, status
- Page tree with drag-drop, hierarchy, child indicators
- Page-level granular permissions *(Enterprise — flag `PAGE_PERMISSIONS`)*
- Page verification, expiring + QMS *(Enterprise — flag `PAGE_VERIFICATION`)*
- Mark obsolete *(Enterprise)*
- Backlinks, mentions, related pages

### 6.4 Editor

Built on **Tiptap 3.x** with custom extensions in `packages/editor-ext`.

Block types and marks:

- Rich text, headings, lists, tables (incl. resize/merge), code blocks (syntax-highlight), math (KaTeX), quote, callout
- Mermaid, Draw.io, Excalidraw diagrams (live)
- Tabs, columns, toggle / accordion, video, audio, image, file attachment
- Slash command palette, drag handle, bubble menu, link suggestion
- Comment marks, mentions, page links
- AI-editor actions (improve, summarize, expand, translate, fix grammar, change tone) *(Enterprise)*
- *(planned)* Technical-doc blocks: API endpoint, DB schema, runbook step, ADR

### 6.5 Real-time Collaboration

- Hocuspocus + Yjs co-editing at `/collab` WebSocket
- Live cursors, presence indicators
- Inline comments anchored to ranges; thread replies, mentions, resolve / reopen
- Standalone collab server (`pnpm collab:dev` / `pnpm collab:prod`)
- Redis sync extension for multi-instance scale-out

### 6.6 Comments & Notifications

- Page-level, inline, threaded comments
- Mentions trigger notifications
- Notification surfaces: in-app, email (SMTP / Postmark), *(planned)* Slack / Teams / webhooks
- 22+ notification events tied to user, page, space, workspace lifecycle

### 6.7 Search

- Postgres full-text (`tsvector` + `unaccent`) — Free
- Typesense driver *(Business+)*
- Attachment indexing for PDF/DOCX *(Business+)*
- AI Search / AI Answers with citations *(Enterprise)*
- Filters: space, author, owner, tag, date, status, kind
- Permission-aware filtering on every result type

### 6.8 AI Knowledge Layer *(Enterprise)*

- Editor AI Assistant ("Ask AI")
- AI Search ("AI Answers") with citations and trust indicators
- AI Chat — multi-turn, with `@page` / `@space` mentions, file uploads, and tool calling against the MCP catalogue
- Pluggable provider layer: OpenAI, Anthropic, Azure OpenAI, Mistral, local LLM
- Embeddings → pgvector or external vector store; chunking + reindex scheduler
- RAG retrieval & answer service with permission-scoped recall
- AI governance: workspace toggles (`ai.generative`, `ai.search`, `ai.chat`, `ai.mcp`), provider routing, exclusions per space, token budgets

### 6.9 Meeting Intelligence *(Enterprise)*

- Audio capture → Speech-to-text (STT) → transcript
- Speaker diarization *(planned)*
- AI-generated summary, action items, decisions, owners
- One-click "Create kickoff / minutes page" bound to a space
- Linked attachments stay accessible from the page

### 6.10 Expert Insights (Human-in-the-loop) *(Enterprise)*

- Annotations attached to AI answers and pages
- Upvote / downvote with reasons
- "Verified expert" badge per topic
- Insight indexer service keeps annotations searchable
- Loop feedback: corrections retrained into RAG ranking + retrieval signals

### 6.11 Documentation Health *(Enterprise, partially planned)*

- Health score 0–100 per page / space / workspace
- Categories: outdated, missing owner, broken link, orphan page, contradictory, low-engagement, duplicate
- Recommended actions surfaced in a dedicated dashboard

### 6.12 Verification & Governance *(Enterprise)*

- Expiring verification (set a TTL, get reminders, escalate to owner)
- QMS-style multi-step review/approval workflow
- Sign-off captured for audit
- "Obsolete" lifecycle state
- Cron-based reminder cadence

### 6.13 Templates & Standards *(Business+)*

- Workspace and space-scoped templates
- Template categorization & search
- Restrict template creation to admins
- *(planned)* AI-generated templates from prompt + corpus

### 6.14 Permissions & Access Control

- Workspace roles: Owner / Admin / Member / Guest
- Groups (assigned to spaces, optionally synced from SSO)
- Space roles: Admin / Writer / Reader
- Page-level granular permissions + inheritance *(Enterprise)*
- Access explanation UI *(Enterprise)*
- *(planned)* Access requests

### 6.15 Public Sharing & Portals *(Business+)*

- Per-page public link with optional password and expiry
- Space-level public-docs portal
- Custom domain
- Disable public sharing per workspace / space *(flag `SHARING_CONTROLS`)*
- Audit all sharing events *(Enterprise)*

### 6.16 Security & Authentication

- Email/password auth
- JWT cookie sessions
- Google OAuth *(Business+, `SSO_GOOGLE`)*
- SAML 2.0, OIDC, LDAP / Active Directory *(Business+, `SSO_CUSTOM`)*
- MFA: TOTP + backup codes *(Business+)*
- Enforce SSO / MFA workspace-wide
- SCIM provisioning *(Enterprise)*
- API keys (user + workspace) *(Business+)*

### 6.17 Compliance & Audit *(Enterprise)*

- Audit logs covering 22 event categories
- Audit-log retention policy
- Trash retention
- Page verification & approval evidence trail
- Security controls (allowed domains, restrict exports, restrict templates)
- Air-gapped deployment posture

### 6.18 Import / Export

- Markdown / HTML (Free)
- Notion, Confluence *(Business+)*
- DOCX import *(Business+, `DOCX_IMPORT`)*
- PDF export *(Business+, `PDF_EXPORT`, requires Gotenberg)*
- Bulk ZIP import *(Business+)*
- Full space / workspace export *(Business+)*
- File-task tracking surfaces long-running import/export jobs to the UI

### 6.19 Diagrams & Visual

- Mermaid, Draw.io, Excalidraw (Free)
- Diagram versioning tied to page history
- *(planned)* AI-generated diagrams (`add_diagram` MCP tool, partially shipped)

### 6.20 Version History

- Page revisions list + restore
- Diff view between versions
- Restore deleted pages from trash
- Trash retention policy *(Enterprise)*

### 6.21 Analytics

- Workspace dashboard metrics (Free; extended Enterprise)
- AI analytics (questions, sources, cost) *(Enterprise)*
- *(planned)* Per-page / per-space analytics

### 6.22 Integrations

- MCP server — implemented *(Enterprise)*
- *(mixed status)* Slack, Teams, Google Drive, SharePoint, Notion, Confluence, Jira, Linear, Asana, Trello
- *(planned)* GitHub, GitLab, Bitbucket, Sentry, Datadog, PostHog, OpenAPI, CI/CD signals
- *(planned)* Webhooks, Zapier, Make, n8n

### 6.23 Deployment

- Self-hosted (Docker / Docker Compose) — Free
- Cloud (managed) — Cloud only
- Air-gapped — *(Business+)*
- Standalone collaboration server

---

## 7. Technology Stack — Top to Bottom

### 7.1 Languages, runtimes

| Layer | Tech |
|---|---|
| Server runtime | **Node.js** (LTS) |
| Server framework | **NestJS** with **Fastify** adapter |
| Server language | **TypeScript** |
| Client runtime | Modern browsers (ES2020+) |
| Client framework | **React 18** |
| Client build | **Vite** |
| Client language | **TypeScript** |
| Monorepo | **pnpm** workspaces + **Nx** task orchestration |
| Package manager | pnpm 10 |

### 7.2 Frontend stack

| Concern | Tech |
|---|---|
| UI library | **Mantine** (v7) |
| Routing | **React Router v7** |
| State (global / UI) | **Jotai** atoms |
| State (server) | **TanStack Query** |
| HTTP client | Axios wrapper at `apps/client/src/lib/api-client.ts` (`/api` base, 401 → `/login`) |
| Editor | **Tiptap 3.20.x** + custom extensions in `packages/editor-ext` |
| Real-time | **@hocuspocus/provider** + **y-prosemirror** + **yjs** + IndexedDB offline cache |
| Diagrams | **Mermaid**, Draw.io (embedded), **Excalidraw** |
| Markdown / HTML conversion | `@joplin/turndown`, `marked`, `dompurify` |
| Tree UI | `react-arborist` (patched) |
| i18n | `i18next`, Crowdin pipeline (`crowdin.yml`), 10+ languages |

Path alias: `@/*` → `apps/client/src/*`.

### 7.3 Backend stack

| Concern | Tech |
|---|---|
| Framework | **NestJS** + Fastify |
| HTTP | Fastify with NestJS adapter |
| DB | **PostgreSQL** (14+) |
| Query builder | **Kysely** (type-safe) |
| Migrations | Kysely migration runner — `apps/server/src/database/migrations/` |
| Codegen | `pnpm migration:codegen` regenerates `database/types/db.d.ts` |
| Cache | **Redis** via `@nestjs-labs/nestjs-ioredis` + `@keyv/redis` cache manager |
| Queues | **BullMQ** on Redis |
| Real-time | **Hocuspocus 3.x** server + **Socket.io** for general events |
| Auth | **Passport** strategies + JWT in cookies; TOTP MFA |
| Authorization | **CASL** rules in `core/casl/` |
| Validation | `class-validator` + `class-transformer` (NestJS DTO pipeline) |
| Logging | Pino-based logger module |
| Context | `nestjs-cls` for async-local context (user, request id, audit actor) |
| Throttling | Custom throttle module |
| Telemetry | OpenTelemetry-compatible, plus internal `telemetry` module |
| Storage | Pluggable: **local FS**, **S3-compatible** (R2, MinIO, AWS S3) |
| Mail | Pluggable: **SMTP**, **Postmark**; preview via `react-email` (`pnpm email:dev`) |
| Search | **PostgreSQL FTS** (Free) + **Typesense** *(Business+)* with permission-aware BM25 |
| Export (PDF) | **Gotenberg** sidecar service |
| Path aliases | `@docmost/db/*`, `@docmost/transactional/*`, `@docmost/ee/*` |

### 7.4 AI stack *(EE)*

| Concern | Tech |
|---|---|
| Provider layer | `ai-provider.service.ts` — unified interface over OpenAI, Anthropic, Azure OpenAI, Mistral, local LLMs |
| Models | Configurable per-feature (chat, embeddings, completions) |
| Embeddings | Provider-backed → pgvector (default) or external vector store |
| Chunking | `chunking.service.ts` — content-aware splitting |
| Indexing | `embedding-indexer.service.ts`, queued via BullMQ; nightly reindex scheduler |
| Retrieval | `rag-retrieval.service.ts` — hybrid (vector + BM25) with permission filter |
| Answer service | `rag-answer.service.ts` — citation-grounded generation; hallucination guardrails |
| Chat | `ai-chat.module.ts` — multi-turn, tool-calling against the MCP catalogue |
| Tool catalogue | 50+ MCP tools under `apps/server/src/ee/ai/chat/tools/` (see §16) |
| MCP server | `mcp.module.ts` — HTTP + streaming MCP endpoint |
| STT | `stt.service.ts` — pluggable provider (OpenAI Whisper, Azure, on-device) |
| Meeting | `meeting.service.ts` — orchestrates STT + summarization + page creation |
| Guards | `WorkspaceAiToggleGuard` enforces per-workspace AI feature gating |
| Tests | Hallucination-guardrails spec, prompts spec, per-tool specs |

### 7.5 Infrastructure & ops

| Concern | Tech |
|---|---|
| Container | Docker + multi-stage Dockerfile |
| Local dev | `docker-compose.yml` for db + redis; `pnpm run dev` for app |
| Hosting (managed) | Cloud option — managed Postgres + Redis + S3 |
| PDF rendering | Gotenberg container |
| Search infra | Typesense container (Business+) |
| Vector store | pgvector (default) or external Qdrant/Weaviate |
| Object storage | Local FS, S3-compatible |
| Reverse proxy / TLS | Operator's choice (Caddy, nginx, Traefik) |
| Process supervision | Operator's choice (systemd, k8s, Nomad) |
| Observability | Logs (pino → stdout), metrics (Prometheus-compatible), traces (OTel) |

### 7.6 Dependencies in the loop

- `@casl/ability` 6.x — permission rules
- `@hocuspocus/{server,provider,transformer}` 3.4.4 — collab
- `@tiptap/*` 3.20.x — editor
- `yjs` ^13.6 — CRDT
- `react-arborist` 3.4.0 — page tree (patched)
- `mermaid` 11.13.0 (override)
- `dompurify` 3.4.1 (override)
- `ws` 8.20.0 (override)
- See `package.json:pnpm.overrides` for the full pin set.

---

## 8. System Architecture

### 8.1 High-level topology

```
                       ┌────────────────────────────────────┐
                       │  Browser / Desktop / Mobile / API  │
                       │  consumers / MCP clients / agents  │
                       └──────────────────┬─────────────────┘
                                          │
                  ┌───────────────────────┴────────────────────────┐
                  │  Edge / Reverse proxy (Caddy / nginx / k8s)    │
                  └───┬──────────────────┬──────────────────┬──────┘
                      │                  │                  │
                      ▼                  ▼                  ▼
              ┌──────────────┐   ┌───────────────┐   ┌──────────────┐
              │  Client SPA  │   │  REST API     │   │  Hocuspocus  │
              │  (Vite SPA)  │   │  (NestJS)     │   │  (collab WS) │
              └──────┬───────┘   └──────┬────────┘   └──────┬───────┘
                     │                  │                   │
                     │                  ▼                   ▼
                     │           ┌─────────────────────────────────┐
                     │           │     Shared NestJS services      │
                     │           │   (core/, ee/, integrations/)   │
                     │           └──────┬──────────┬───────────┬───┘
                     │                  │          │           │
                     ▼                  ▼          ▼           ▼
              ┌───────────┐      ┌──────────┐  ┌────────┐  ┌────────────┐
              │ Socket.io │      │ Postgres │  │  Redis │  │  S3-store  │
              │ (events)  │      │ (Kysely) │  │(BullMQ)│  │  (assets)  │
              └───────────┘      └──────────┘  └────────┘  └────────────┘
                                                  │
                                                  ▼
                                          ┌────────────────┐
                                          │  AI providers  │
                                          │  (OpenAI, etc.)│
                                          └────────────────┘
```

### 8.2 Process layout

| Process | Role | Scaling |
|---|---|---|
| `apps/client` | Static SPA, built by Vite, served from CDN or by the server's static module | CDN |
| `apps/server` (API) | NestJS HTTP + Socket.io | horizontal |
| Hocuspocus | Collab server; can run inside `apps/server` or standalone | horizontal, sticky-by-doc via Redis sync |
| BullMQ workers | In-process or split out by `processors/` | horizontal |
| Gotenberg | PDF rendering sidecar | as-needed |
| Typesense | Optional search node | replicate per region |
| Postgres / Redis | Stateful | managed or HA |

### 8.3 Module boundaries (server)

`apps/server/src/`
- `core/` — Workspace, Space, Page, User, Auth, Comment, Search, Share, Favorite, Group, Notification, Session, Attachment, Watcher, Doc-Health, Expert-Insights, CASL, *core.module.ts*
- `ee/` — `ai/`, `api-key/`, `audit/`, `licence/`, `page-verification/`, `ee.module.ts`
- `integrations/` — `mail/`, `storage/`, `queue/`, `export/`, `import/`, `health/`, `security/`, `telemetry/`, `redis/`, `static/`, `throttle/`, `audit/`, `environment/`, `transactional/`
- `collaboration/` — Hocuspocus gateway, persistence extension, auth extension, redis-sync extension, standalone main
- `common/` — guards, interceptors, decorators, logger, helpers
- `database/` — Kysely client, repos under `repos/`, migrations, generated `types/db.d.ts`
- `ws/` — Socket.io gateway for general real-time events

### 8.4 Module boundaries (client)

`apps/client/src/features/`
- `attachments/`, `auth/`, `comment/`, `doc-health/`, `editor/`, `favorite/`, `file-task/`, `group/`, `home/`, `notification/`, `page/`, `page-history/`, `search/`, `session/`, `share/`, `space/`, `user/`, `websocket/`, `workspace/`
- Each feature contains its own `atoms/`, `hooks/`, `queries/`, `services/`, `types/`, `components/`.
- `ee/` mirrors EE features at the UI layer; `pages/` are top-level routes; `App.tsx` declares the router.

### 8.5 Request flow (page load → render)

1. Browser loads SPA from CDN or static module.
2. Bootstrap call fetches workspace, user, feature flags, license posture.
3. Routes hydrate per `App.tsx` (`/s/:spaceSlug/p/:pageSlug` for editor).
4. Page data fetched via REST (`/api/page/...`); Yjs doc fetched via Hocuspocus over `/collab` WS.
5. Editor mounts with Tiptap; presence and edits flow over Hocuspocus.
6. Socket.io subscribes to notifications, comments, watcher signals.

### 8.6 Background processing

`apps/server/src/integrations/queue/` defines BullMQ queues. Examples:

- Email send queue
- Attachment processing
- Search reindex
- Embedding indexer (EE)
- Import/Export file tasks
- Audit log batching
- Notification fan-out
- Verification reminder cron
- AI cost rollups

`file-task.controller.ts` exposes job state to the UI.

### 8.7 Multi-tenancy

A workspace is the tenant boundary. Within a process, every domain query is scoped by `workspaceId`. Cloud deployments run shared infrastructure; self-hosted deployments typically run one workspace per cluster (multi-workspace supported).

### 8.8 Failure / degradation modes

| If down | Impact |
|---|---|
| Postgres | Total outage |
| Redis | Queues halt, cache cold, real-time degraded but recoverable |
| Hocuspocus | Co-editing offline; clients fall back to last-known state via IndexedDB |
| Object storage | New uploads fail; existing pages render minus binary blobs |
| AI provider | AI features degrade — UI surfaces "AI temporarily unavailable" |
| Gotenberg | PDF export fails; UI surfaces actionable error |
| Typesense (when configured) | Search falls back to Postgres FTS |

---

## 9. Data Model

The authoritative shape lives in `apps/server/src/database/types/db.d.ts`, generated from the migrations in `apps/server/src/database/migrations/`. The conceptual entities:

### 9.1 Core entities

- **Workspace** — top-level tenant; settings, branding, license/plan posture.
- **User** — globally unique; can belong to multiple workspaces (cloud) or one (self-hosted).
- **Group** — collection of users within a workspace; can be SSO-synced.
- **Space** — namespace inside a workspace; type, visibility, owner.
- **Page** — content unit inside a space; tree-structured via parent_id, ordered by a fractional index.
- **PageContent** — JSON / Yjs doc; current state + revisions.
- **PageRevision** — historical snapshot with diff metadata.
- **Comment** — page-level and inline; mark-based anchor for inline.
- **Attachment** — uploaded file; metadata + storage handle.
- **Favorite** — per-user bookmarks.
- **Share** — public-link record (token, expiry, password, scope).
- **Notification** — per-user delivery record.
- **Session** — auth session, refresh token bookkeeping.
- **AuditEvent** *(EE)* — append-only event with actor + target.
- **PageVerification** *(EE)* — TTL, verifier, signoff trail.
- **ApiKey** *(EE)* — user / workspace scoped, hashed.
- **Embedding** *(EE)* — chunk id, page id, vector, model, hash.
- **ExpertInsight** *(EE)* — annotation, target, score, verified-by.
- **DocHealthSnapshot** *(EE, partial)* — per-page metrics with category flags.
- **MeetingTranscript** *(EE)* — audio handle, transcript, summary, derived page link.
- **FileTask** — long-running import/export job state.
- **WatcherSubscription** — per-user / per-page notification subscription.

### 9.2 Relations (conceptual)

```
Workspace 1───* User (membership)
Workspace 1───* Space
Space 1───* Page
Page 1───* Page (parent_id) → tree
Page 1───* Comment 1───* CommentReply
Page 1───* Attachment
Page 1───* PageRevision
Page 1───* Embedding chunks      (EE)
Page 1───1 PageVerification      (EE)
User  *───* Group
Group *───* Space (role)
Page  *───* User  (page perms)   (EE)
Workspace 1───* AuditEvent       (EE)
Workspace 1───* ApiKey           (EE)
Workspace 1───* MeetingTranscript (EE)
```

### 9.3 Identifiers

- All entity ids are UUID v4 (where the EE upgrades to UUIDv7 internally for time-ordering, the public id remains v4-compatible).
- Slugs are derived for spaces and pages and are user-renamable.

### 9.4 Indexing strategy

- BTREE on foreign keys + (workspace_id, *) composites.
- GIN on `tsvector` columns for full-text search.
- pgvector ivfflat / hnsw on the embedding table.
- Audit table is append-only with monthly partitions in Enterprise deployments at scale.

### 9.5 Migrations

- Run from `apps/server`:
  - `pnpm migration:create` — scaffold a new migration
  - `pnpm migration:up` — next pending
  - `pnpm migration:latest` — all pending
  - `pnpm migration:down` — rollback one
  - `pnpm migration:codegen` — regenerate types from live schema

### 9.6 Retention

- Trash retention *(Enterprise)* purges hard-deleted pages after the configured window.
- Audit-log retention *(Enterprise)* enforces an org-set window.
- Attachment GC reclaims orphaned blobs.

---

## 10. AI Subsystem — Deep Dive

### 10.1 Capability set

| Capability | Surface | Module |
|---|---|---|
| **AI Editor Assistant** | In-editor action menu and slash commands | `ee/ai/generate/` |
| **AI Search / AI Answers** | Top search bar, dedicated answers panel | `ee/ai/rag/` |
| **AI Chat** | Floating chat with mentions, files, tools | `ee/ai/chat/` |
| **MCP server** | External agents | `ee/ai/mcp/` |
| **STT** | Audio → transcript | `ee/ai/stt/` |
| **Meeting Intelligence** | Audio → transcript → summary → page | `ee/ai/meeting/` |
| **Embeddings** | Indexing + retrieval | `ee/ai/embeddings/` |
| **Expert Insights** | HITL annotations | `core/expert-insights/` + `embeddings/insight-indexer.service.ts` |

### 10.2 Provider abstraction

`ai-provider.service.ts` exposes a single interface for:

- `chat()` — text generation with optional tool calls
- `embed()` — dense vectors
- `transcribe()` — STT
- `moderate()` — safety classifier *(planned/optional)*

Adapters wrap OpenAI, Anthropic, Azure OpenAI, Mistral, and a local-LLM driver (Ollama / vLLM). Per-feature model selection and routing is workspace-configurable.

### 10.3 Retrieval pipeline

1. **Chunking** — `chunking.service.ts` segments page content (heading-aware, length-bounded), preserving anchors.
2. **Embedding** — chunks are embedded by the configured provider and stored with `(page_id, chunk_id, hash, vector, model)`.
3. **Queueing** — embedding work is BullMQ-backed; failures retry; a nightly reindex scheduler closes drift.
4. **Permission filter** — at retrieve time, the candidate set is filtered through the user's CASL permission graph before re-ranking.
5. **Hybrid rank** — vector top-k merged with BM25 from the search subsystem.
6. **Citation pinning** — selected passages are bound to the answer with stable anchors.

### 10.4 Answer generation

- Prompts live in `ee/ai/generate/prompts.ts` and `ee/ai/chat/` (per-tool prompts).
- Hallucination guardrails enforce that any factual claim must be backed by retrieved sources; `hallucination-guardrails.spec.ts` validates this contract.
- Cost is metered per workspace; budgets and provider routing are governed by AI governance settings.

### 10.5 Tool-calling catalogue

All chat tools live under `apps/server/src/ee/ai/chat/tools/`. Each has a `.tool.ts` (definition) and a `.spec.ts` (unit test). The current set:

- **Workspace / users:** `get_current_user`, `list_workspace_members`
- **Spaces:** `list_spaces`, `get_space`, `get_space_info`, `update_space`, `list_space_pages`, `create_space`
- **Pages:** `get_page`, `create_page`, `update_page`, `update_page_title`, `update_page_content`, `delete_page`, `duplicate_page`, `copy_page_to_space`, `move_page`, `move_page_to_space`, `list_child_pages`, `list_recent_pages`, `get_page_breadcrumbs`, `get_page_history`, `search_pages`
- **Comments:** `create_comment`, `get_comments`, `get_page_comments`, `update_comment`, `delete_comment`
- **Attachments:** `search_attachments`
- **RAG:** `rag_retrieve`
- **Diagrams:** `add_diagram` (Mermaid)

Tools share a registry (`chat-tool.registry.ts`) and a typed schema (`chat-tool.types.ts`) reused by both AI Chat and the MCP server.

### 10.6 Hallucination guardrails

- Forbid claims without retrieved support.
- Penalize answers that contradict marked-verified pages.
- "I don't know" is a first-class answer.
- Optional moderation classifier on user prompts (configurable per workspace).

### 10.7 AI governance

- Per-feature toggles: `ai.generative`, `ai.search`, `ai.chat`, `ai.mcp`.
- Provider routing per feature.
- Per-space exclusion list (sensitive content never embedded).
- Per-workspace token budgets, hard ceilings, alerting.
- Per-user opt-out where compliance requires.

### 10.8 Meeting Intelligence flow

1. Upload audio (browser recorder or file upload).
2. STT job queued; transcript stored with timestamps.
3. Summarizer prompts produce: TL;DR, decisions, action items (with owner/date), risks, follow-ups.
4. UI offers "Create page" — generates a structured page from a template, bound to the chosen space, with the transcript as an attachment.
5. Action items are filed as page tasks (and *(planned)* synced to Linear / Jira).

### 10.9 Expert Insights loop

1. Reader gets an AI answer; expert clicks "Improve this" or "Verify."
2. Annotation captured; linked to source passages.
3. Insight indexer adds the annotation to retrieval signals — future retrieval boosts expert-validated passages and demotes contradicted ones.
4. Verified badges accrue against a user-topic pair.

---

## 11. Real-Time Collaboration

### 11.1 Wire

- WebSocket endpoint `/collab` served by Hocuspocus.
- Vite dev server proxies `/collab` to the backend during local development.
- Bearer JWT (cookie or header) authenticates the connection via the auth extension.

### 11.2 Extensions

`apps/server/src/collaboration/extensions/`
- **authentication.extension** — validates JWT + scope
- **persistence.extension** — debounced flush of Yjs doc state to Postgres
- **redis-sync.extension** — fan-out across instances; sticky-by-doc is not required because state syncs through Redis
- **logger / metrics** — request counts, doc loads, sync errors

### 11.3 Editor binding

- Tiptap document uses `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-caret`.
- IndexedDB keeps an offline copy via `y-indexeddb` so editors survive transient disconnects.

### 11.4 Standalone mode

`pnpm collab:dev` / `pnpm collab:prod` runs collab as its own process — useful for separating real-time capacity planning from REST API capacity planning.

### 11.5 Conflict semantics

- CRDT (Yjs) — guaranteed eventually consistent under arbitrary partition.
- Comments are anchored to Yjs marks, so they survive concurrent edits to surrounding text.
- Mentions and embedded blocks behave as atomic Tiptap nodes.

---

## 12. Search Subsystem

### 12.1 Layers

1. **Postgres FTS** — default. `tsvector` columns with `unaccent`; BM25 ordering; permission-aware filter joins.
2. **Typesense** — optional driver for Business+ workspaces with very large content sets.
3. **AI Search** — top-of-funnel for Enterprise; returns answers + cited passages alongside classic results.

### 12.2 Indexed surfaces

- Page title, body (rendered text), tags, owner
- Attachments (PDF, DOCX) when attachment indexing is on
- Comments (optional)
- Insights (so a "what did the expert say" query surfaces annotation text)

### 12.3 Filters

`space`, `author`, `owner`, `tag`, `date`, `status`, `kind`. Business+ adds extended filters.

### 12.4 Permission-aware results

Every result is filtered through the same CASL ability used in REST endpoints, so a result list never surfaces a page the requester cannot open.

### 12.5 Reindexing

- On page save → enqueue reindex
- On attachment upload → enqueue extract + index
- Nightly reindex scheduler closes any drift
- Manual "reindex space" admin action

---

## 13. Permissions, Roles, Sharing

### 13.1 Role taxonomy

| Scope | Roles |
|---|---|
| Workspace | Owner, Admin, Member, Guest |
| Space | Admin, Writer, Reader |
| Page *(EE)* | granular allow/deny per user or group |
| Group | (membership only) |
| API key | user-scope or workspace-scope, capability-limited |

### 13.2 Authorization model

- CASL rules in `apps/server/src/core/casl/`.
- Every controller method declares the required ability; the guard resolves the actor's abilities for the relevant target (page → space → workspace).
- Inheritance: page perms inherit from parent unless overridden; space perms inherit from workspace defaults.

### 13.3 Sharing surfaces

- Internal: members of a space see what the space exposes.
- Public link: per-page; optional password, expiry, max views.
- Public-docs portal: a space published with optional custom domain, brand removal, password.
- External invitations: workspace-scoped, with an SSO-aware acceptance flow.

### 13.4 Access requests *(planned)*

- "Request access" CTA on denied pages
- Owner notification + one-click grant
- Audit trail of grants / denials

---

## 14. Security, Authentication & Compliance

### 14.1 Auth methods

- Email + password
- Google OAuth *(Business+)*
- SAML 2.0 *(Business+)*
- OIDC *(Business+)*
- LDAP / Active Directory *(Business+)*
- TOTP MFA + backup codes *(Business+)*
- Workspace-wide enforce SSO / MFA *(Business+)*
- SCIM provisioning *(Enterprise)*
- API keys, user and workspace scoped *(Business+)*

### 14.2 Session model

- JWT in HTTP-only cookies, short-lived access + refresh
- Server-side session bookkeeping for revocation
- IP / UA stamped at login for audit

### 14.3 Hardening

- CSRF tokens for state-changing endpoints
- DOMPurify sanitization on all user HTML
- Pinned vulnerability-prone deps via pnpm overrides (`dompurify`, `ws`, `axios`, `follow-redirects`, etc.)
- Throttling on auth + AI endpoints
- Content Security Policy enforced
- Storage URL signing for private attachments
- Rate-limited public-link views; password and expiry available

### 14.4 Compliance posture *(Enterprise)*

- Audit logs across 22 event categories (user lifecycle, page lifecycle, sharing, AI usage, etc.)
- Retention policies on trash and audit
- Page verification with QMS-grade sign-off
- Approval workflows with evidence trail
- Air-gapped deployment posture (no required outbound calls in the "Free + Business" footprint; AI providers are explicitly opted-in)
- Data residency: cloud regions chosen at signup; self-hosted anywhere

### 14.5 Posture against common attacks

| Threat | Mitigation |
|---|---|
| Stored XSS | DOMPurify + CSP + sanitized Tiptap output |
| CSRF | SameSite cookies + token check |
| Account takeover | Throttling + MFA + audit on sensitive changes |
| Privilege escalation | CASL with explicit deny, regression-tested per release |
| Data exfil via public links | Per-link password, expiry, audit, workspace-wide disable |
| Prompt injection through ingested content | Provenance-aware retrieval, separation of system vs retrieved-context blocks, hallucination guardrails |
| Tool abuse via MCP / API keys | Capability-scoped tokens, per-tool audit events, throttling |

---

## 15. Integrations & Extensibility

### 15.1 Communication

- Slack — notifications + slash command + bot DM Q&A *(mix of shipped + planned)*
- Microsoft Teams — notifications + bot *(planned)*
- Email — first-class (SMTP / Postmark)

### 15.2 Project & ticketing

- Jira, Linear, Asana, Trello — link, sync mentions, file action items from meetings *(planned / partial)*

### 15.3 Source code & dev signals

- GitHub, GitLab, Bitbucket — surface README + ADRs + code links *(planned)*
- Sentry, Datadog, PostHog — incident pages auto-link metrics *(planned)*
- CI/CD signals — runbooks tagged with last incident timestamp *(planned)*

### 15.4 Document sources

- Notion, Confluence, GitBook — bulk import + ongoing mirror *(import shipped; mirror planned)*
- Google Drive, SharePoint, OneDrive — file embed + search *(planned)*

### 15.5 Automation

- Webhooks *(planned)*
- Zapier / Make / n8n connectors *(planned)*

### 15.6 Programmatic

- REST API — `docs/reference/api.md`
- MCP server — see §16
- API keys with capability scoping

### 15.7 OpenAPI / spec ingestion *(planned)*

- Drop in an OpenAPI spec → auto-generate API-reference pages with endpoint blocks
- Diff specs on upload → propose page updates

---

## 16. MCP — The Agentic Layer

Conqra Hub is itself a first-class **Model Context Protocol** server. Any MCP-capable agent (Claude Desktop, Claude Code, Cursor, internal copilots) can connect, authenticate, and read/write workspace knowledge under audit.

### 16.1 Endpoints

- `mcp.controller.ts` — JSON-RPC endpoint
- `mcp-stream.controller.ts` — SSE / streaming
- `mcp-tools-list.controller.ts` — capability discovery

### 16.2 Auth

- Workspace API key with capability scoping
- Per-call audit event with actor + tool + arguments digest

### 16.3 Tool surface

The MCP catalogue mirrors the AI Chat tool catalogue (§10.5). Tools are typed with a shared JSON Schema so external agents can introspect them. Categories:

- **Read**: pages, spaces, comments, history, breadcrumbs, members
- **Write**: create / update / delete pages, comments, spaces; copy & move pages across spaces; insert Mermaid diagrams
- **Search**: pages, attachments, RAG retrieval
- **User**: current user, workspace members

### 16.4 Governance

- Workspace-level MCP toggle (`ai.mcp`)
- Per-API-key tool whitelist
- Audit event per tool call
- Rate limiting per key

### 16.5 What this unlocks

- Claude / ChatGPT / Gemini / internal agents reading and editing company knowledge under permission
- Build-time agents that auto-update API reference pages on every release
- Customer-support agents that consult the wiki before answering
- Workflow automations that file meeting action items as Linear tickets

---

## 17. Deployment Models & Infrastructure

### 17.1 Modes

| Mode | Audience | Notes |
|---|---|---|
| **Self-hosted Free** | OSS users | Docker / docker-compose; community license |
| **Self-hosted Business / Enterprise** | Paying self-hosters | License key, optional support |
| **Managed Cloud** | All tiers | Hosted by us; plan-based feature resolution |
| **Air-gapped Enterprise** | Defense / pharma / regulated | No outbound; bundled bring-your-own LLM |

### 17.2 Minimum stack

- Postgres 14+
- Redis 6+
- Node 20+
- (optional) Gotenberg (PDF export)
- (optional) Typesense (Business+ search)
- (optional) S3-compatible storage
- (optional) AI provider — local LLM in air-gapped mode

### 17.3 Cloud

- Managed Postgres + Redis
- Object storage on S3 / R2
- CDN for client SPA + attachments
- Horizontal API tier + dedicated collab tier
- Region selection at workspace creation
- Stripe billing → plan → feature resolver

### 17.4 Air-gapped

- Offline license activation
- No required outbound calls
- All AI features must point at on-prem providers (local LLM / Azure-private / SageMaker)
- Audit log retention configurable
- Crypto-signed installer

### 17.5 Environment variables

See `docs/deployment/environment-variables.md` and `.env.example`. Key ones:

- `APP_URL`, `APP_SECRET` (≥32 chars), `DATABASE_URL`, `REDIS_URL`
- `STORAGE_DRIVER` = `local | s3`, plus S3 creds
- `MAIL_DRIVER` = `smtp | postmark`, plus credentials
- `CLOUD` = `true | false`
- AI provider keys (per provider)
- Typesense URL + key (if used)
- Gotenberg URL (if PDF export used)

### 17.6 Upgrade

- Migrations are forward-only; downgrades require restore-from-backup
- Hocuspocus and API are forward-compatible across minor versions
- Editor format migrations are applied at load-time via Tiptap version-aware adapters

---

## 18. Operations, Observability & SLOs

### 18.1 Logging

- Pino structured logs to stdout
- Request id (CLS) on every log line
- Audit logs are domain logs, not application logs — separate destination, append-only

### 18.2 Metrics

- Prometheus-compatible endpoint on the API
- Key metrics: request rate / latency / 5xx; collab connect/disconnect; queue depth/retries; embedding throughput; AI token spend; storage egress

### 18.3 Tracing

- OpenTelemetry support; recommended exporters: OTLP → Honeycomb / Tempo / Datadog

### 18.4 Health endpoints

- `/api/health` — liveness
- `/api/health/ready` — readiness (DB, Redis, queues)

### 18.5 Backups

- Postgres: PITR via WAL archiving
- Object storage: versioned bucket
- Hocuspocus state is debounced into Postgres; no separate backup needed

### 18.6 SLOs (target)

| Surface | Target |
|---|---|
| API p95 latency | < 250 ms |
| API availability | 99.9% (cloud) |
| Co-edit p95 sync round-trip | < 200 ms |
| AI answer p95 latency | < 6 s (RAG + 1k-token answer) |
| Search p95 | < 400 ms |
| Import job throughput | 500 pages / 5 min |

### 18.7 Incident playbook outline

- Page on 5xx > 1% for 5 min
- Page on collab disconnect rate > 5 / s
- Page on AI provider error rate > 2% for 10 min
- Page on queue depth > 1k for 10 min

---

## 19. Non-Functional Requirements

| Concern | Target |
|---|---|
| Scale (workspace) | 1M pages, 100k users, 10k concurrent editors |
| Scale (cloud, multi-tenant) | 10k workspaces per shard |
| Page open latency | < 800 ms cold, < 200 ms warm |
| Editor input latency | < 50 ms local, < 200 ms peer |
| Accessibility | WCAG 2.2 AA target across the app |
| Internationalization | 10+ languages via Crowdin pipeline; RTL-ready layout |
| Browser support | Latest 2 of Chrome, Firefox, Safari, Edge |
| Mobile | Responsive layout; native apps are a (planned) horizon |
| Data residency | Region-pinned in cloud; arbitrary in self-host |
| GDPR / SOC 2 / ISO 27001 | Roadmapped; audit + retention + access controls already cover the substrate |

---

## 20. Quality, Testing & Release Engineering

### 20.1 Test pyramid

- **Unit** — Jest on the server (`*.spec.ts`); Vitest on the client
- **E2E (server)** — supertest under `apps/server` `test:e2e`
- **E2E (client)** — Playwright (planned/partial)
- **Permission regression** — explicit role-matrix tests for sensitive endpoints
- **AI quality** — hallucination-guardrails spec, per-tool specs, prompt snapshot tests
- **Migration tests** — every migration round-trips on a CI database

### 20.2 Lint & format

- ESLint (server + client) with `--fix`
- Prettier on `src/` and `test/`

### 20.3 CI / CD

- Build matrix runs `nx build`, server tests, client typecheck, lint
- Migrations applied on a throwaway DB during CI
- Release tags drive Docker image builds
- Cloud auto-deploys on tag promotion

### 20.4 Feature flags

- License + plan resolver decides flag state
- Workspace-level overrides for AI sub-toggles
- Flag list — `docs/reference/feature-flags.md`

### 20.5 Release cadence

- Minor releases ~ every 2 weeks
- Patch releases as needed
- LTS line for Enterprise self-hosters

---

## 21. Roadmap — Now / Next / Later

### 21.1 Now (short term — extending what already ships)

- **AI Search refinement** — confidence display, missing-source warnings.
- **AI Editor Assistant** — round out the action set; broader context awareness.
- **AI Chat** — add space-mode and admin-mode in addition to page mentions.
- **Page Verification** — reminder cadence + verifier UX polish.
- **Templates** — categorization + AI-suggest.
- **Attachment search** — extend formats (XLSX, PPTX).
- **Audit logs** — export + anomaly highlighting.
- **Admin dashboard** — full metrics view.

### 21.2 Next (mid term — net-new capabilities)

- **Documentation Health Center** — score 0–100 with drilldowns.
- **Knowledge gap detection** — frequently-failed searches, missing topics, contradictions.
- **Human Expert Insights** — annotations on AI answers, votes, verified-expert badges.
- **AI-generated documentation spaces** — bootstrap an entire space from a brief.
- **Search analytics** — what users search, what they click, what they don't.
- **Broken link detection** — internal + external; auto-suggest replacements.
- **Duplicate content detection** — semantic, not just title-based.
- **Stronger AI governance** — token budgets, provider routing, sensitive-space exclusion.

### 21.3 Later (strategic bets)

- **Company Brain Graph** — entity/relationship graph across all workspace knowledge; reasoning across pages.
- **Maintenance agents** — auto-update outdated pages, propose merges, flag drift.
- **Auto-doc from code** — generate API / architecture / runbook pages from repo + CI signals.
- **Smart onboarding paths** — role-aware reading lists with progress tracking.
- **Role-based AI assistants** — engineer-mode, sales-mode, support-mode with scoped prompts and tool access.
- **Compliance automation** — auto-generate audit trails, attestations, policy renewal calendars.
- **Client-facing AI knowledge portals** — public docs with embedded Q&A scoped to a customer contract.
- **Multi-workspace federation** — search and ask across workspaces while preserving per-workspace permissions.
- **Native desktop + mobile apps** — wrapping the SPA with offline-first sync.
- **Browser extension** — capture, annotate, file knowledge from anywhere.

### 21.4 Delivery phases (formal PRD mapping)

The detailed PRD breaks delivery into eight phases — every roadmap item maps to one:

1. Core wiki foundation *(shipped)*
2. Collaboration and content quality *(shipped)*
3. Business and Enterprise security *(shipped)*
4. AI knowledge layer *(largely shipped)*
5. Migration and integrations *(in flight)*
6. Governance and intelligence *(partial)*
7. External knowledge experience *(partial)*
8. Enterprise operations and scale *(starting)*

---

## 22. The Future — Conqra Hub as a Knowledge OS

This section is the **north-star definition** of where Conqra Hub goes. It is intentionally ambitious; the architectural substrate that enables it already exists in the codebase.

### 22.1 From "wiki + AI" to "knowledge OS"

A wiki stores pages. A knowledge OS is a runtime where:

- **Knowledge is an entity** — pages, sections, decisions, runbooks, ADRs, meetings, and tickets are all first-class typed objects with explicit relations.
- **Provenance is fundamental** — every assertion knows who wrote it, when, under what verification, with what supporting sources.
- **Permissions are programmable** — every read, every retrieval, every agent call is permission-aware end-to-end.
- **AI is a co-worker, not a layer** — agents can read, write, propose, and verify under the same rules as humans, with the same audit posture.

### 22.2 The Company Brain Graph

A typed graph spanning the workspace:

- Nodes: `Person`, `Team`, `Space`, `Page`, `Section`, `Decision`, `Incident`, `Customer`, `Product`, `Repo`, `API`, `Metric`, `Meeting`, `ActionItem`, `Insight`
- Edges: `owns`, `verifies`, `derivesFrom`, `contradicts`, `references`, `supersedes`, `mentions`, `triggeredBy`, `decidedIn`

Built from:

- The existing page tree + backlinks
- Page Verification records
- Expert Insights
- Meeting transcripts and action items
- MCP-imported signals (commits, incidents, tickets)

Queries become possible that today are impossible:

- *"Show me every page whose owner left in the last quarter."*
- *"Show me decisions about feature X and the meeting that made them."*
- *"Which runbooks reference a deprecated API?"*

### 22.3 Maintenance agents

Persistent, scoped agents that:

- Watch for drift (`code → doc`, `policy → doc`)
- Propose edits via MCP (not auto-merge — proposed under HITL)
- Detect contradictions across pages
- Flag broken links and unowned pages
- Generate freshness reports

Every agent action is an audit event; every change is reviewable.

### 22.4 Role-mode assistants

A single AI Chat surface that adapts by role:

- *Engineer-mode* — code-aware retrieval, runbook templates, incident playbooks
- *Sales-mode* — battlecards, pricing, customer references
- *Support-mode* — KB-first answers, ticket-deflection metrics
- *HR-mode* — policies, benefits, onboarding paths

Each mode has its own system prompt, tool allowlist, and metric set.

### 22.5 Auto-generated workspace bootstrapping

A new workspace can be "born" from inputs:

- Existing Confluence / Notion / Google Drive content
- A repo's README / ADRs / OpenAPI spec
- Meeting recordings from the last quarter
- A brief: *"We are a B2B fintech, 30 people, regulated, here is our org chart."*

The output: a populated set of spaces, pages, templates, verification policies, and reading paths — reviewed and accepted by a human before going live.

### 22.6 Public knowledge experiences

Public-docs portals evolve into **AI-powered customer knowledge portals**:

- Embedded Q&A scoped to a customer's contract / product entitlements
- "Why am I seeing this answer?" — citations to public docs only
- Per-portal analytics: what customers ask, where they fail
- Per-portal feedback loop back into the internal Doc Health Center

### 22.7 Multi-workspace federation

Search and ask across multiple workspaces (e.g., parent + subsidiary, agency + clients) while preserving per-workspace permissions. Implemented via federated retrieval over per-workspace ACLs — never a global index.

### 22.8 Compliance automation

- Auto-generate evidence packs for SOC 2 / ISO 27001 / GDPR audits
- Policy renewal calendars driven by verification metadata
- Sign-off chains traceable end-to-end from page to audit event

### 22.9 Workflows on knowledge

Pages stop being pure documents. Selected blocks can drive workflows:

- A *runbook step* block can be marked "Run now" and execute a configured action
- An *ADR* block emits a webhook on accept / reject
- A *policy* block schedules a verification due date

This makes the wiki an active surface, not a passive one.

### 22.10 Native desktop, mobile, and offline

- A native desktop wrapper with full Yjs offline sync
- iOS / Android clients on the same data model
- "Read on the train" mode — selected spaces fully prefetched

### 22.11 Marketplace

A community marketplace for:

- Templates
- Verification policies
- Health-check rules
- AI agents (with capability manifests)
- MCP tool packs

### 22.12 Data products

Workspaces become a data source other systems consume:

- Read-only GraphQL on the graph (planned)
- Streaming change events
- Embeddable widgets ("the latest verified policy on X")

---

## 23. Glossary

- **Workspace** — top-level tenant in Conqra Hub.
- **Space** — namespace inside a workspace; holds pages.
- **Page** — content unit; tree-structured; Yjs-backed.
- **Block** — atomic editor node (paragraph, heading, callout, diagram, …).
- **Verification** — Enterprise workflow that asserts a page is current.
- **HITL** — Human-in-the-loop; expert annotations that improve AI behavior.
- **MCP** — Model Context Protocol; how external agents call Conqra Hub tools.
- **Hocuspocus** — the real-time CRDT server (Yjs).
- **CASL** — the authorization rule engine.
- **RAG** — Retrieval-Augmented Generation.
- **Doc Health** — score / category system for documentation freshness and integrity.
- **Edition** — Free / Business / Enterprise.
- **Plan** — cloud Stripe-driven subscription bound to features.
- **License** — self-hosted key bound to features.
- **Feature flag** — runtime gate combining plan, license, workspace toggle.

---

## Cross-references

- Product: [`product/`](./product/README.md)
- Architecture: [`architecture/`](./architecture/README.md)
- Engineering: [`engineering/`](./engineering/README.md)
- Deployment: [`deployment/`](./deployment/README.md)
- Admin: [`admin/`](./admin/README.md)
- Reference: [`reference/`](./reference/README.md)
- PRD (full spec, per area): [`prd/`](./prd/README.md)
- Glossary: [`glossary.md`](./glossary.md)

---

*End of document.*
