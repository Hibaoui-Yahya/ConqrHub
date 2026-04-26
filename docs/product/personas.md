# Personas

ConqrAI Wiki is designed around six personas. Each section lists who they are, what they need, and how the product serves them.

---

## 1. Employee / Knowledge Consumer

**Who.** Any team member who reads documentation to do their job — engineering, support, sales, operations, HR.

**Primary needs.**
- Quickly find trusted information.
- Ask questions in natural language and get an answer (not just links).
- Understand internal processes without paging a colleague.
- Collaborate on team documentation.
- Comment, ask for clarification, and receive updates.

**How the product serves them.**
- Full-text + AI search with cited sources.
- AI Chat scoped to the pages they have access to.
- Permission-aware results — no leakage from spaces they can't see.
- Notifications when pages they watch change.

---

## 2. Contributor / Editor

**Who.** People who actively write and maintain documentation: tech leads, PMs, ops leads, anyone owning a runbook or spec.

**Primary needs.**
- A modern, low-friction editor that handles rich content.
- Real-time co-editing without merge conflicts.
- Templates so they don't start from a blank page.
- AI-assisted writing for tone, clarity, length.
- Easy way to ask reviewers for feedback.

**How the product serves them.**
- Tiptap-based editor with slash commands, block drag-handles, paste cleanup.
- Yjs/Hocuspocus real-time co-editing.
- Workspace + space-level templates.
- Editor AI Assistant (improve writing, fix grammar, summarize, translate, continue writing, …).
- Inline + page comments with mentions and assignment.

---

## 3. Knowledge Owner / Knowledge Manager

**Who.** People accountable for a subset of company knowledge being correct and current — process owners, documentation leads, regulated-content owners.

**Primary needs.**
- Detect outdated documentation before it bites.
- Assign owners and reviewers.
- Standardize templates across the org.
- Monitor documentation health.
- Ensure critical pages are verified and stay verified.

**How the product serves them.**
- Page verification (expiring + QMS modes) with re-verification reminders.
- Documentation Health center (planned + partial).
- Knowledge Gap detection from search analytics + AI.
- Audit log of who changed what.

---

## 4. Admin / IT Owner

**Who.** Workspace owners, IT admins, security leads, identity engineers.

**Primary needs.**
- SSO and MFA across the org.
- SCIM provisioning to keep user lifecycle in sync with the IdP.
- Audit logs for compliance.
- Tight control over public sharing.
- Self-hosted or air-gapped deployment when required.

**How the product serves them.**
- SAML 2.0, OIDC, LDAP, Google OAuth providers.
- TOTP MFA with backup codes; enforceable workspace-wide.
- SCIM 2.0 (Okta, Azure AD, Google Workspace).
- Comprehensive audit log with retention controls.
- Disable-public-sharing toggle workspace- or space-wide.
- Docker / Docker-Compose deployment, air-gapped support.

---

## 5. Technical Lead / Engineer

**Who.** Software engineers, data engineers, AI engineers, DevOps, SREs.

**Primary needs.**
- Rich technical editor (code, diagrams, math, tables).
- API, DB, architecture, runbook, ADR documentation blocks.
- Mermaid / Draw.io / Excalidraw diagrams.
- GitHub / GitLab / Bitbucket integration.
- Strong version history and restore.
- Review and approval workflow.

**How the product serves them.**
- Custom editor extensions for code blocks, math, embeds, callouts.
- Diagram extensions (Mermaid, Draw.io, Excalidraw).
- Page history with diff and restore.
- QMS approval workflow for regulated documentation.
- MCP endpoint so internal AI agents and Claude Desktop can read/write docs.

---

## 6. External Client / Guest

**Who.** Customers, partners, contractors, auditors who need access to *some* documentation but should not see internal content.

**Primary needs.**
- Read selected pages or spaces.
- Access client-specific documentation portals.
- Comment where allowed.
- Use public documentation portals for self-service.
- Search published knowledge.

**How the product serves them.**
- Public sharing of pages with optional password and expiration.
- Public documentation portals at custom domains.
- Guest authenticated access to selected spaces (planned + partial).
- Permission-controlled commenting for non-editors.

---

## Cross-persona principles

- **Permission-aware everything.** Search, AI answers, notifications, and analytics never leak content the viewer can't see.
- **No second-class read-only experience.** Viewers and commenters get the same speed and quality of UX as editors, just without write capability.
- **Governance is built in, not bolted on.** Verification, approval, audit, and retention exist alongside the everyday writing flow.

For the formal user stories and acceptance criteria for each persona, see [`../prd/`](../prd/README.md).
