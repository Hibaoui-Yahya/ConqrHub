# PRD 01 — Vision & Personas

> **Source:** [`_legacy/product-requirements-user-stories-functional-spec.md`](../_legacy/product-requirements-user-stories-functional-spec.md), lines 1–67.

## Vision statement

ConqrAI Wiki is an AI-powered collaborative wiki and documentation platform for organizations that need trusted, structured, searchable, governed, and continuously improved knowledge.

It is not only a place to write pages. It is a **company knowledge operating system** — for creating, collaborating, searching with AI, validating with experts, managing permissions, enforcing governance, and maintaining quality over time.

## Core product promise

> *Can our people find the right trusted knowledge at the right time, and can we prove that this knowledge is accurate, governed, and up to date?*

## Strategic differentiation

Six pillars (full descriptions in [`../product/vision.md`](../product/vision.md)):

1. **Collaborative documentation** — modern wiki, rich editor, spaces, comments, templates, real-time editing.
2. **AI-powered knowledge access** — AI Search, AI Answers, AI Chat, AI Assistant, source citations.
3. **Human-in-the-loop governance** — expert insights, page verification, review workflows, approval states.
4. **Enterprise readiness** — SSO, MFA, SCIM, audit logs, permissions, API keys, retention, air-gapped.
5. **Documentation intelligence** — health score, knowledge gap detection, outdated detection, search analytics.
6. **Technical-documentation depth** — API, DB, architecture, runbooks, diagrams, incidents.

## Target customers

- SaaS companies
- Consulting firms
- Engineering organizations
- Industrial / aerospace / automotive
- Customer support, HR, operations
- Regulated organizations (review/approval workflows)
- Companies replacing Confluence / Notion / GitBook / scattered Google Docs

## Personas

| # | Persona | Key need |
|---|---|---|
| 1 | Employee / Knowledge Consumer | Find answers, procedures, policies fast |
| 2 | Contributor / Editor | Create + maintain documentation |
| 3 | Knowledge Owner | Accuracy, freshness, governance of docs |
| 4 | Admin / IT Owner | Users, security, permissions, compliance |
| 5 | Technical Lead / Engineer | API, runbooks, architecture, ADR docs |
| 6 | External Client / Guest | Selected documentation without internal exposure |

Detailed persona descriptions: [`../product/personas.md`](../product/personas.md).

## Cross-cutting principles

- **Permission-aware everything** — search, AI, notifications never leak unauthorized content.
- **No second-class read-only experience** — viewers and commenters get the same UX speed and quality.
- **Governance built-in** — verification, approval, audit, retention live alongside everyday writing.
