# Roadmap

Innovation roadmap split by horizon. Items map to Product Areas in the formal PRD; cross-links lead to the spec for each.

---

## Short term — extending what already ships

These build directly on shipped foundations and are mostly UI / UX polish or extensions of existing services.

- **AI Search** with source citations and trust-level indicators *(currently shipped; refine confidence display, missing-source warnings)*
- **AI Assistant in editor** — round out the action set, improve context awareness *(see [`../prd/08-ai-assistant-and-chat.md`](../prd/08-ai-assistant-and-chat.md))*
- **AI Chat with `@page` mentions** — already shipped; add space-mode and admin-mode
- **Page verification workflow** — already shipped; tighten reminder cadence and verifier UX
- **Documentation templates** — already shipped; add categorization and AI-suggest
- **Attachment search** — Business+ feature; expand supported formats (XLSX, PPTX)
- **Audit logs** — shipped; add export, anomaly highlighting
- **Admin dashboard** — partial; flesh out full metrics view

## Mid term — net-new capabilities

These require new modules but reuse existing infrastructure (search index, audit trail, AI subsystem).

- **Documentation Health Center** — health score 0–100, drilldowns by category *(see [`../prd/21-documentation-health.md`](../prd/21-documentation-health.md))*
- **Knowledge gap detection** — surface frequently-failed searches, missing topics, contradictory pages
- **Human expert insights** — annotations attached to AI answers, votes, verified-expert badges *(see [`../prd/09-human-in-the-loop.md`](../prd/09-human-in-the-loop.md))*
- **AI-generated documentation spaces** — bootstrap a whole space from a brief
- **Search analytics** — what users search, what they click, what they don't
- **Broken link detection** — internal + external; auto-suggest replacements
- **Duplicate content detection** — semantic, not just title-based
- **Stronger AI usage governance** — token budgets, provider routing, sensitive-space exclusion

## Long term — strategic bets

These are direction-setting and reframe ConqrAI Wiki from "wiki + AI" to "company knowledge OS."

- **Company Brain Graph** — entity-and-relationship view of all workspace knowledge, enabling reasoning across pages
- **AI agents that maintain documentation** — auto-update outdated pages, propose merges, flag drift
- **Auto-generate docs from code repositories** — directly produce API / architecture / runbook pages from a repo + CI signals
- **Smart onboarding paths** — role-aware curated reading lists with progress tracking
- **Role-based AI assistants** — engineer-mode, sales-mode, support-mode with tuned prompts and tool access
- **Compliance automation** — auto-generate audit trails, attestations, policy renewal calendars
- **Client-facing AI knowledge portals** — public-docs portals with embedded Q&A scoped to that customer's contract
- **Multi-workspace knowledge federation** — search and ask across multiple workspaces while preserving per-workspace permissions

---

## Phasing

The PRD breaks delivery into eight phases (see [`../prd/27-roadmap.md`](../prd/27-roadmap.md)):

1. **Phase 1** — Core wiki foundation
2. **Phase 2** — Collaboration and content quality
3. **Phase 3** — Business and Enterprise security
4. **Phase 4** — AI knowledge layer
5. **Phase 5** — Migration and integrations
6. **Phase 6** — Governance and intelligence
7. **Phase 7** — External knowledge experience
8. **Phase 8** — Enterprise operations and scale

Phases 1–4 are shipped or substantially shipped; Phase 5 is in flight; Phases 6–8 map to the mid- and long-term sections above.

## Dependencies & sequencing

- **Health Center** depends on (a) audit-log data and (b) page-verification metadata. Both are shipped → green to build.
- **Expert insights** depend on the AI Answers retrieval layer. Shipped → green.
- **Auto-doc-from-code** depends on a stable MCP write-API (which exists) plus per-repo connector work.
- **Multi-workspace federation** depends on the SCIM + audit substrate being mature. Mostly shipped, but cross-workspace permission model is net-new design work.

For up-to-date status of any item, the PRD areas are the source of truth.
