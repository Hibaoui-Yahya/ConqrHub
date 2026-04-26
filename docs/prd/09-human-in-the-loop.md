# PRD 09 — Human-in-the-Loop Knowledge

> **Source:** lines 947–1037.

## Area overview

The system improves over time using **human expertise** — not just embeddings and LLM output. Subject-matter experts can correct, annotate, and verify AI answers.

This is one of the six core differentiators (see [`../product/vision.md`](../product/vision.md)).

## Epic 9.1 — Expert Insights

### Feature 9.1.1 — Expert annotations on AI answers

**User stories.**
- As an SME, I want to add corrections so AI answers improve.
- As an SME, I want to add a warning to flag tricky cases.
- As a viewer, I want to see expert verification beside AI answers so I can trust them.

**Acceptance criteria.**
- Expert insights attach to AI answers and to source pages.
- Insights show expert name, role, department, date, confidence, verification status.
- Insights are searchable and indexable.
- Voting / helpfulness signals captured.

**Functional requirements.**
- Add expert insight below AI answers
- Add correction · warning · operational note · best practice · workaround · example
- Attach files, images, audio, video
- Mark insight as verified
- Vote insight as helpful

**Insight metadata.**
Expert name · role · department · date · confidence level · related page · related source · verification status.

**Why it matters.** This makes ConqrAI different from "just AI search" — the system improves through expertise, not just retrieval tuning.

## Epic 9.2 — Knowledge Gap Detection (planned / partial)

### Feature 9.2.1 — Detect & surface gaps

**User stories.**
- As a knowledge manager, I want to see what's missing or outdated so I can prioritize fixes.
- As an admin, I want failed-search analytics so I know what users want.

**Acceptance criteria.**
- Gap list updates from search analytics + AI signals.
- Each gap suggests an owner, priority, template, content outline.
- Gaps assignable to users.

**Detects.**
Missing pages · outdated · duplicated · contradictory · without owners · without verification · frequently searched with no results · unresolved comments · critical processes without runbooks.

**Output.**
Knowledge gap list · suggested page titles · suggested owners · suggested priority · suggested template · suggested content outline.

## Epic 9.3 — Expert Search Routing (planned)

Route questions about a topic to designated experts when documentation is insufficient.

## Cross-references

- Documentation Health: [`./21-documentation-health.md`](./21-documentation-health.md)
- AI subsystem: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- Verification: [`./11-review-verification-governance.md`](./11-review-verification-governance.md)
