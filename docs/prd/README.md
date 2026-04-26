# Product Requirements (PRD)

*Audience: Product managers, designers, engineers writing the spec, QA writing tests, anyone who needs the formal "what".*

This section contains the formal product spec, broken out into one file per Product Area. Each file follows the same structure:

> **Product Area → Epic → Feature → User Stories → Acceptance Criteria → Functional Requirements → UX/UI Requirements → Technical Notes → Test Cases**

The content is preserved verbatim from the original 13,500-line `ProductRequirements_UserStories_FunctionalSpecification.md` (now in [`../_legacy/`](../_legacy/README.md)) — only the file boundaries and minor heading normalization have changed.

## Foundations
- [`01-vision-and-personas.md`](./01-vision-and-personas.md) — Vision, core promise, differentiation, target customers, the six personas.

## Core experience
- [`02-workspace-organization.md`](./02-workspace-organization.md) — Workspace creation, configuration, health dashboard.
- [`03-spaces.md`](./03-spaces.md) — Spaces, visibility, organization, archival.
- [`04-pages-and-content-lifecycle.md`](./04-pages-and-content-lifecycle.md) — Pages, statuses, metadata, hierarchy, drafts/publishing.
- [`05-rich-editor.md`](./05-rich-editor.md) — Editor, blocks, technical-doc blocks (API / DB / runbook / ADR).
- [`06-collaboration.md`](./06-collaboration.md) — Real-time editing, comments and feedback.

## Discovery & intelligence
- [`07-search-and-discovery.md`](./07-search-and-discovery.md) — Full-text search, AI Search, AI Answers.
- [`08-ai-assistant-and-chat.md`](./08-ai-assistant-and-chat.md) — Editor AI, AI Chat, MCP.
- [`09-human-in-the-loop.md`](./09-human-in-the-loop.md) — Expert insights, knowledge gap detection.
- [`10-templates.md`](./10-templates.md) — Templates and standardization.
- [`11-review-verification-governance.md`](./11-review-verification-governance.md) — Page verification (QMS + expiring), review workflow.

## Access, security, compliance
- [`12-permissions-and-access-control.md`](./12-permissions-and-access-control.md) — The full permissions model and admin UX.
- [`13-public-sharing-and-external-access.md`](./13-public-sharing-and-external-access.md) — Public links, doc portals, guest auth.
- [`14-security-and-authentication.md`](./14-security-and-authentication.md) — SSO, MFA, security controls.
- [`15-audit-and-compliance.md`](./15-audit-and-compliance.md) — Audit logs, retention, admin console.

## Content lifecycle
- [`16-import-and-export.md`](./16-import-and-export.md) — Import (Notion / Confluence / DOCX / MD) and export (MD / HTML / PDF).
- [`17-templates-and-standards.md`](./17-templates-and-standards.md) — Page templates, documentation standards.
- [`18-diagrams-and-visual.md`](./18-diagrams-and-visual.md) — Mermaid, Draw.io, Excalidraw.
- [`19-history-and-trash.md`](./19-history-and-trash.md) — Version history, trash and archive.

## Insights
- [`20-analytics.md`](./20-analytics.md) — Workspace, page, and space analytics.
- [`21-documentation-health.md`](./21-documentation-health.md) — Health score, knowledge gap detection.
- [`22-integrations.md`](./22-integrations.md) — Productivity, developer, automation integrations.

## Plans, deployment, NFRs
- [`23-plans-and-licensing.md`](./23-plans-and-licensing.md) — Plans, feature gating, licensing.
- [`24-deployment-and-infrastructure.md`](./24-deployment-and-infrastructure.md) — Self-hosted, air-gapped, queues, observability, backup, upgrades.
- [`25-non-functional-requirements.md`](./25-non-functional-requirements.md) — Security, performance, reliability, accessibility.
- [`26-quality-and-testing.md`](./26-quality-and-testing.md) — Test pyramid, specialized test suites.

## Strategy & launch
- [`27-roadmap.md`](./27-roadmap.md) — Eight-phase product roadmap.
- [`28-go-to-market.md`](./28-go-to-market.md) — Positioning, differentiation, messaging library.
- [`29-advanced-ai-and-automation.md`](./29-advanced-ai-and-automation.md) — Knowledge graph, workflow automation, intelligent onboarding.
- [`30-launch-readiness.md`](./30-launch-readiness.md) — MVP / Business / Enterprise launch checklists.
- [`31-rollout-and-enablement.md`](./31-rollout-and-enablement.md) — Internal rollout, customer training.
- [`32-success-metrics.md`](./32-success-metrics.md) — Adoption, quality, AI success metrics.
- [`33-risks.md`](./33-risks.md) — Product and market risk register.
- [`34-decision-log.md`](./34-decision-log.md) — Product decision log.

---

## Why split this way?

The original file was 13,500 lines and 400 KB — too large for any IDE preview, code-review tool, or LLM context window to handle gracefully. Splitting by Product Area:

- Lets each area be reviewed and updated independently.
- Maps cleanly to ownership (one PM per area).
- Lets test plans, designs, and code reviews link to a stable URL per feature.
- Keeps the formal spec separate from the more discursive product overviews in [`../product/`](../product/README.md).

If you need the original 13,500-line scroll, it lives untouched in [`../_legacy/product-requirements-user-stories-functional-spec.md`](../_legacy/product-requirements-user-stories-functional-spec.md).
