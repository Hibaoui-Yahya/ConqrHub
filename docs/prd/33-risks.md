# PRD 33 — Risks

> **Source:** PA 33, lines 13328–13444.

## Area overview

Risk register. Each risk has a category, likelihood × impact assessment, mitigation, and an owner.

## Product / market risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| P-1 | AI hallucination causes a customer-visible factual error | High | High | Citations on every AI answer; permission filter on retrieval; HITL expert insights |
| P-2 | Customers prefer Confluence's ecosystem | Medium | Medium | Strong import path; AI differentiation; governance differentiation |
| P-3 | Notion adds enterprise features fast enough to neutralize our edge | Medium | High | Move faster on governance + air-gapped + verification |
| P-4 | Enterprise customers reject AI features due to vendor concerns | Medium | High | Per-workspace AI toggles; provider choice; air-gapped + Ollama support |
| P-5 | Air-gapped deployments outpace our support capacity | Low | Medium | Self-service docs; certification program for partners |

## Technical risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| T-1 | Permission bug exposes restricted content | Low | Critical | Property tests; static review; multi-layer enforcement |
| T-2 | Real-time scaling cliff at high concurrency | Medium | High | Standalone collab process; Redis pub/sub; load testing pre-launch |
| T-3 | AI provider outage takes down AI features | Medium | Medium | Provider fallback; circuit breaker; degrade to non-AI search |
| T-4 | Migration breaks existing data | Low | High | Two-phase migrations; backups; staging environment cycle |
| T-5 | License key forgery | Very Low | High | Asymmetric signing; key rotation runbook |

## Operational risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| O-1 | Postgres backup not restorable | Low | Critical | Quarterly restore drills |
| O-2 | Stripe webhook lost → subscription stale | Medium | Medium | Periodic reconciliation job |
| O-3 | Audit log fills disk | Low | High | Retention policy on by default for hosted; size alarm |
| O-4 | Email delivery rate drops below 95% | Medium | Medium | Postmark + fallback; bounce handling |

## Compliance / legal risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| C-1 | GDPR right-to-be-forgotten request impossible to fulfill | Low | High | User-deletion workflow that anonymizes content; tested |
| C-2 | License compliance issue (AGPL vs commercial mixing) | Low | Critical | EE module isolation; legal review of every PR touching EE boundary |
| C-3 | Customer's regulator audits and finds gap | Medium | High | Audit log; verification workflow; documentation of process |

## Risk reviews

- Quarterly risk-register review with engineering, product, security, legal.
- New risks added when discovered; closed risks moved to a separate log.
- Critical risks reviewed monthly until mitigated.

## Cross-references

- Permissions: [`./12-permissions-and-access-control.md`](./12-permissions-and-access-control.md)
- Architecture: [`../architecture/`](../architecture/README.md)
- License model: [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md)
- Decision log: [`./34-decision-log.md`](./34-decision-log.md)
