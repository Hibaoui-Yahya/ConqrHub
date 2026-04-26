# PRD 21 — Documentation Health

> **Source:** PA 21, lines 5660–5804. Status: **major roadmap item**, partial today.

## Area overview

A meta-system that scores and maintains the quality of documentation. The product's headline differentiator alongside AI Search.

## Epic 21.1 — Documentation Health Score

### Feature 21.1.1 — Health score 0–100

Computed from:
- Freshness — when was each page last updated?
- Completeness — are pages complete vs. just stubs?
- Ownership — does each critical page have an owner?
- Verification — what % of critical pages are currently verified?
- Search success — do users find what they search for?
- Broken links — internal and external link health
- Duplicate content — semantic + title overlap
- Unresolved comments — open vs. resolved
- AI confidence — how often does AI Search produce confident answers vs. fall back to "I don't know"?

**Per-space score** + **workspace score** + **drilldowns** by category.

## Epic 21.2 — Health Categories

A page falls into one or more of:
- Healthy
- Outdated (no update in N months, no verification)
- Missing owners
- Missing reviewers
- Duplicate
- Broken links
- Weak documentation (too short, no structure)
- Unanswered questions
- Failed searches (page that should exist but doesn't)
- Unverified critical page

## Epic 21.3 — Knowledge Gap Detection

See also [`./09-human-in-the-loop.md`](./09-human-in-the-loop.md).

### Feature 21.3.1 — Gap signals

- Frequently searched terms with no good results
- Topics where AI Search returns low-confidence answers
- Repeated questions in chat without canonical sources
- Spaces with growing user activity but stagnant documentation

### Feature 21.3.2 — Recommended actions

Per gap, the system suggests:
- Create missing page (with title + outline)
- Update outdated page
- Assign owner / reviewer
- Merge duplicates
- Archive obsolete page
- Add sources
- Improve page title
- Add template structure

## Epic 21.4 — Health Center UX (planned)

Settings → Documentation Health.

- Workspace and per-space score with trends
- Top issues with one-click "Fix" or "Assign"
- Subscribe to alerts when score drops

## Status

**MVP shipped 2026-04-26.** Workspace + per-space score (0–100) over 4 signals (freshness, ownership, verification, content strength), and an issue list across 4 categories (outdated, missing-owner, unverified-critical, weak-content), live at `Settings → Documentation health`. See [`../admin/documentation-health.md`](../admin/documentation-health.md).

Deferred to follow-up iterations:
- Trend graphs and historical snapshots (v1.1)
- Alert subscription when score drops (v1.1)
- Broken external link checks (v1.2)
- Semantic duplicate detection (v1.2)
- AI-confidence and search-success signals (v2 — depend on PRD 20.2 analytics + AI Search analytics)
- Knowledge Gap Detection epic (Epic 21.3 — v2)

## Cross-references

- Vision: [`../product/vision.md`](../product/vision.md) (differentiation pillar 4)
- Roadmap: [`../product/roadmap.md`](../product/roadmap.md)
- Verification: [`./11-review-verification-governance.md`](./11-review-verification-governance.md)
- HITL: [`./09-human-in-the-loop.md`](./09-human-in-the-loop.md)
