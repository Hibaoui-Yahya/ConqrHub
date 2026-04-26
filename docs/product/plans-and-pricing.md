# Plans & Pricing

ConqrAI Wiki ships in three tiers. The split mirrors how organizations adopt the product: try it free → standardize a team on it → roll it out company-wide with governance.

| | **Community** | **Business** | **Enterprise** |
|---|:---:|:---:|:---:|
| Cost | Free | $3.50 / user / month | Custom |
| Self-hosted | Yes | Yes | Yes |
| Cloud | — | Yes | Yes |
| Best for | Individuals, small teams, OSS users | Teams needing security + productivity features | Large orgs needing governance, compliance, scale |

The full per-feature matrix lives in [`./feature-catalogue.md`](./feature-catalogue.md). What follows is the **headline split** by tier.

---

## Community (Free)

Everything you need to run a wiki for a small team or as an individual contributor.

- Pages, rich editor, real-time collaboration
- Spaces, groups, page history & restore, comments, diagrams
- Markdown / HTML import + export
- Full-text search
- Self-hosting on your own infrastructure (Docker / Docker-Compose)
- Community support

## Business

For teams that need control over identity, sharing, and content quality.

Everything in **Community**, plus:

- **Identity & access** — SSO (Google / SAML 2.0 / OIDC / LDAP), MFA, API keys
- **Sharing controls** — public sharing, custom-domain portals, branding removal, disable-sharing toggles
- **Content** — page templates, comment resolution, viewer comments, version history (full)
- **Search** — Typesense driver, attachment indexing (PDF / DOCX)
- **Import / export** — Notion, Confluence, DOCX import; PDF export (via Gotenberg)
- **AI** — *(no AI yet at Business — AI is Enterprise; see note below)*
- **Deployment** — air-gapped support
- **Support** — email support

## Enterprise

For organizations where knowledge governance and compliance are first-class concerns.

Everything in **Business**, plus:

- **Governance** — page verification (expiring + QMS approval), audit logs (22 event categories with retention), retention controls (trash, audit, attachments)
- **Permissions** — page-level granular permissions with inheritance and access explanation
- **Identity** — SCIM 2.0 provisioning (Okta, Azure AD, Google Workspace, …)
- **AI** — Generative AI (Ask AI), AI Search with citations, AI Chat (with tool calling), MCP server, AI governance
- **Documentation intelligence** — Health score, knowledge-gap detection *(roadmap)*
- **Support** — priority support, custom contracts, custom deployment support

---

## Cloud vs self-hosted

ConqrAI Wiki resolves a workspace's entitlements differently depending on deployment mode:

| | **Cloud** | **Self-hosted** |
|---|---|---|
| **Authority** | Subscription plan | License key |
| **Resolution** | `LicenseCheckService.resolveFeatures()` reads the plan record | `LicenseCheckService.resolveFeatures()` parses & validates the signed key |
| **Billing** | Stripe (`/billing/info`, `/billing/checkout`, `/billing/portal`) | Out-of-band; key activation via `/license/activate` |
| **Trials** | Yes — plan-driven | Yes — short-dated trial keys |
| **Air-gapped** | N/A | Yes |

When a feature is locked, the upgrade label adapts:

- **Cloud:** *"Upgrade your plan"*
- **Self-hosted (free):** *"Available with a paid license"*
- **Self-hosted (paid, missing this feature):** *"Upgrade your license tier"*

For the implementation, see [`../architecture/feature-gating.md`](../architecture/feature-gating.md).

---

## Notes

- **AI is Enterprise-only by default.** This positions AI as the differentiator for organizations replacing Glean / Guru / GitBook with AI rather than as a Business-tier upsell.
- **Self-hosted Business and Enterprise are real, fully supported options.** The license-key path is first-class — many features were built for it (air-gapped, license activation UI, fallback when EE module is unavailable).
- **The `Standard` tier exists in code** (`LicenseCheckService.resolveTier()` returns `free | standard | business | enterprise`) but is not part of the public pricing page. It exists for grandfathered customers and trial conversions.

For the deployment-side configuration, see [`../deployment/`](../deployment/README.md).
For the admin UI of license management, see [`../admin/billing-and-license.md`](../admin/billing-and-license.md).
