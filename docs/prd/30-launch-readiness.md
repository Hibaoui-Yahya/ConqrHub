# PRD 30 — Launch Readiness

> **Source:** PA 30, lines 12537–12948 (continuation).

## Area overview

Three readiness checklists — MVP, Business launch, Enterprise launch.

## Epic 30.1 — MVP Launch Readiness

**Functional surface.**
- [ ] Workspace + member management
- [ ] Spaces with default permissions
- [ ] Pages with hierarchy and rich editor
- [ ] Real-time collaboration
- [ ] Comments (inline + page-level)
- [ ] Full-text search
- [ ] Markdown / HTML import + export
- [ ] Page history + restore
- [ ] Email notifications
- [ ] Self-hosted Docker deployment

**Quality.**
- [ ] Permission tests in CI
- [ ] Real-time tests in CI
- [ ] Migration up/down tested
- [ ] Smoke E2E covers signup → page → comment → invite

**Operational.**
- [ ] Postgres backup / restore tested
- [ ] Logs structured
- [ ] Health endpoints respond
- [ ] `.env.example` complete

**Documentation.**
- [ ] Getting-started guide
- [ ] Self-hosted runbook
- [ ] Permission matrix
- [ ] License posture (AGPL + EE)

## Epic 30.2 — Business Launch Readiness

Everything in MVP plus:

- [ ] SSO (Google, SAML, OIDC, LDAP) production-tested with at least one customer of each type
- [ ] MFA TOTP + backup codes shipped
- [ ] API keys with expiration and revoke
- [ ] Templates (workspace + space)
- [ ] Comment resolution + viewer comments
- [ ] Public sharing controls
- [ ] Notion + Confluence + DOCX import
- [ ] PDF export with Gotenberg
- [ ] Typesense driver
- [ ] Attachment indexing
- [ ] Air-gapped deployment validated
- [ ] License activation flow

**Audit + monitoring.**
- [ ] All `Feature.*` flags have server-side gating
- [ ] Lock-state UX verified for cloud + self-hosted

## Epic 30.3 — Enterprise Launch Readiness

Everything in Business plus:

- [ ] Page-level permissions with inheritance + access explanation
- [ ] Audit log with 22 event categories + retention
- [ ] Retention policies (trash + audit)
- [ ] Page verification (expiring + QMS)
- [ ] SCIM with at least Okta and Azure AD
- [ ] AI subsystem (Generative + Search + Chat + MCP) with governance
- [ ] Admin reset MFA workflow (out-of-band acceptable for now)
- [ ] Compliance documentation pack (SOC 2 readiness, security overview)
- [ ] Penetration test signed off
- [ ] DR runbook tested
- [ ] Customer success onboarding flow

## Cross-references

- Roadmap phases: [`./27-roadmap.md`](./27-roadmap.md)
- Quality / testing: [`./26-quality-and-testing.md`](./26-quality-and-testing.md)
- NFRs: [`./25-non-functional-requirements.md`](./25-non-functional-requirements.md)
