# PRD 32 — Success Metrics

> **Source:** PA 32, lines 13137–13327.

## Area overview

What we measure to know if the product is succeeding. Three families: adoption, documentation quality, AI success.

## Epic 32.1 — Product Adoption Metrics

| Metric | Target |
|---|---|
| Weekly active users / total users | > 60% |
| Pages created per week | Trend up monthly |
| Comments per active user | > 1/week |
| Spaces per workspace | > 5 (mature workspace) |
| Templates used per page-create | > 30% |
| Onboarding completion rate | > 80% |

### Cohort tracking

- Month 1 retention
- Month 3 retention
- Month 12 retention

## Epic 32.2 — Documentation Quality Metrics

The metrics that map directly to the documentation health score.

| Metric | Target |
|---|---|
| % of pages with an owner | > 80% |
| % of "critical" pages verified | > 90% |
| % of pages updated in the last 90 days | > 50% |
| Broken links per workspace | Trend down |
| Duplicate-content pairs | < 5% |
| Average comment-resolution time | < 7 days |
| Failed-search rate | < 10% |

## Epic 32.3 — AI Success Metrics

| Metric | Target |
|---|---|
| AI Search confident-answer rate | > 70% |
| AI answer thumbs-up rate | > 50% |
| AI Chat conversation completion (vs. abandon) | > 60% |
| MCP API calls per active workspace | Trend up |
| Pages cited per 100 AI answers | > 80 (high citation density indicates grounding) |
| User-reported "found my answer" rate | > 60% |

### Negative metrics (to drive down)

- AI hallucination reports
- "AI gave wrong answer" feedback
- AI failed-to-answer rate
- AI response latency P95

## Epic 32.4 — Operational Metrics

| Metric | Target |
|---|---|
| API P95 latency | < 200 ms |
| Search P95 latency | < 200 ms |
| Real-time disconnect rate | < 1% |
| Background job failure rate | < 0.1% |
| Audit-log lag | < 30 s |
| Email delivery rate | > 99% |

## Cross-references

- Documentation health: [`./21-documentation-health.md`](./21-documentation-health.md)
- AI subsystem: [`../architecture/ai-subsystem.md`](../architecture/ai-subsystem.md)
- NFRs: [`./25-non-functional-requirements.md`](./25-non-functional-requirements.md)
- Analytics: [`./20-analytics.md`](./20-analytics.md)
