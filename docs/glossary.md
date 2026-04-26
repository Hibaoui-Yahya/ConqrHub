# Glossary

Terms that recur throughout the documentation. Defined once here so the rest of the docs can stay short.

| Term | Meaning |
|---|---|
| **Workspace** | The top-level container that represents one company / tenant. Has its own users, spaces, settings, and license/subscription. |
| **Space** | An organizational unit inside a workspace (Engineering, HR, a project, a client). Has its own member list, permissions, and template set. |
| **Page** | The primary knowledge object — a document. Pages live inside a space and form a tree (parent / children). |
| **Group** | A named set of users used for bulk permission assignment (e.g. `Engineering`, `Leadership`). |
| **Role** | A workspace-level role: Owner, Admin, Knowledge Manager, Space Admin, Editor, Commenter, Viewer, Guest. |
| **Permission** | A specific action right (view / edit / comment / manage) at a level (workspace / space / page / feature). |
| **Restriction (page)** | A page-level override that narrows access below the inherited space-level permissions. |
| **Verification** | The umbrella feature (`Feature.PAGE_VERIFICATION`) that records whether a page is currently trustworthy. Two modes, picked per page or workspace policy: *Expiring verification* and *QMS approval*. The terms "review" and "approve" appearing in the PRDs always map to one of these two modes. |
| **Expiring verification** | Mode 1 of Verification. A verifier marks the page `verified`; verification expires on a cadence and forces re-review. Status flow: `verified → expiring → expired`. |
| **QMS approval** | Mode 2 of Verification. Author submits a page for approval; a verifier approves or rejects with a comment. Approved pages enter the `verified` state. The two modes can be combined (a QMS-approved page can still expire). |
| **Owner (page)** | The user accountable for a page's accuracy. Different from creator/editor. |
| **Public share** | A page or space exposed to non-authenticated visitors via a public link. |
| **Tier** | Free / Standard / Business / Enterprise — the subscription level that gates features. |
| **Feature flag** | A `Feature.*` string constant that gates a paid capability. See `apps/server/src/common/features.ts`. |
| **Entitlement** | The set of features a workspace currently has access to. Persisted client-side as a Jotai atom. |
| **License** | The signed key (self-hosted) or plan record (cloud) that determines entitlements. |
| **EE / Enterprise Edition** | Code under `apps/{server,client}/src/ee/` and `packages/ee/`. Commercially licensed; loaded dynamically on the server. |
| **Hocuspocus** | The collaboration server (Yjs CRDT over WebSocket) at `/collab`. |
| **Yjs** | The CRDT library used for conflict-free real-time editing. |
| **Tiptap** | The rich-text editor framework (built on ProseMirror) the wiki uses. |
| **MCP** | Model Context Protocol — the spec that lets external AI clients (Claude Desktop, etc.) call tools against ConqrAI Wiki. |
| **AI Search / AI Answers** | A search experience that returns a generated answer with cited source pages. |
| **AI Chat** | A multi-turn conversational assistant scoped to workspace content; can call tools to read / write pages. |
| **Generative AI / Ask AI** | The in-editor assistant (improve writing, summarize, translate, …). |
| **Knowledge gap** | A topic users search for but the workspace has no good answer to. |
| **Documentation Health** | A computed score (0–100) reflecting freshness, ownership, verification, broken links, etc. |
| **CASL** | The authorization library used by the backend (`apps/server/src/core/casl/`). |
| **Kysely** | The type-safe SQL query builder used for the data layer. Schema types live in `apps/server/src/database/types/db.d.ts`. |
| **BullMQ** | The Redis-backed queue used for background jobs (email, indexing, audit, billing webhooks, AI work). |
| **SCIM** | System for Cross-domain Identity Management — automated user/group provisioning from IdPs. |
| **TOTP** | Time-based One-Time Password — the second factor used for MFA. |
| **Slug** | URL-safe identifier for a workspace / space / page. |
| **Slug ID** | A short content-addressed ID embedded in a page URL (`/p/<slugId>-<title>`), distinct from the title slug. |
| **ProseMirror JSON** | The native serialized representation of editor content, stored alongside the Yjs binary state. |
| **Air-gapped** | Deployment with no outbound internet — relevant for regulated / sovereign environments. |
| **Docmost** | The original open-source project this codebase is forked from. Upstream repo is `github.com/docmost/docmost`. Referenced here for traceability, not as current branding. |
