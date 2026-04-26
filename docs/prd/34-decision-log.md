# PRD 34 — Product Decision Log

> **Source:** PA 34, lines 13445+.

## Area overview

A running log of product-level decisions: what was decided, when, why, and what was considered. Distinct from architectural ADRs — those live in code as ADRs / RFC docs alongside the modules they govern.

## Format

Each entry:

```
## YYYY-MM-DD — Decision title

Status: Accepted | Superseded | Reversed
Decider: <name(s)>
Stakeholders: <names>

### Context
What was the situation? What pressure / need triggered the decision?

### Decision
What did we decide?

### Alternatives considered
- Alternative A — rejected because …
- Alternative B — rejected because …

### Consequences
- Positive — …
- Negative — …
- Open questions — …
```

## Open decision queue

Topics anticipated to need decisions soon:

- Pricing tier for AI Search (Business vs Enterprise) — current default Enterprise; review when Business demand surfaces.
- Per-space AI exclusion — implementation approach (filter at index time vs query time).
- Multi-region cloud architecture.
- Federated workspaces — single search across multiple workspaces with shared identity.
- Documentation Health scoring algorithm — weights and threshold tuning.

## Accepted decisions (illustrative — fill in as decisions are made)

### 2026-01-15 — Use Tiptap (vs Slate, ProseMirror direct, Lexical)

**Status:** Accepted.

**Context.** Building a collaborative, block-based editor with rich custom nodes.

**Decision.** Tiptap on top of ProseMirror, with custom extensions in `packages/editor-ext`.

**Alternatives.**
- ProseMirror direct — too low-level; reinventing what Tiptap provides.
- Slate — less mature ecosystem.
- Lexical — newer; less collab tooling.

**Consequences.** Mature ecosystem; large extension library; well-trodden Yjs integration.

### 2026-02-05 — EE submodule pattern (vs feature flags only)

**Status:** Accepted.

**Context.** Need to keep OSS users able to clone and run; need EE customers to get paid features; need both code paths to coexist.

**Decision.** Private git submodule at `apps/server/src/ee/`; dynamic loading via `ModuleRef`.

**Alternatives.**
- Single repo with all code, paid features hidden behind flags — license violation risk.
- Separate repo entirely, downstream users build their own — too much friction.

**Consequences.** OSS users can self-host; EE customers get the full experience; license boundary is enforceable. See [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md).

### 2026-03-10 — Vercel AI SDK (vs LangChain, direct provider SDKs)

**Status:** Accepted.

**Context.** Multiple providers; streaming + tool calling; air-gapped support via Ollama.

**Decision.** Vercel AI SDK as the abstraction; per-provider configuration.

**Alternatives.**
- LangChain — too heavyweight; opinionated abstractions that fight our use cases.
- Direct provider SDKs per provider — more code, more maintenance.

**Consequences.** Single integration surface; easy to add new providers; tool calling and streaming uniform.

## Cross-references

- Risks: [`./33-risks.md`](./33-risks.md)
- Roadmap: [`./27-roadmap.md`](./27-roadmap.md)
- For architectural decisions tied to code modules, see ADR / RFC docs alongside `apps/server/src/<module>/`.
