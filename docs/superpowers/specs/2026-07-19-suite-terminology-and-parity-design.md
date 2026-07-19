# Conqr Suite — Terminology Unification & Feature Parity (AI / MCP / Integrations)

**Date:** 2026-07-19
**Scope:** ConqrHub (Docmost fork, `ConqrHub/`) and the Plane fork (`plane/`, branch `conqr/integration`)
**Driver:** User request: "any term that means the same in both platforms must use the same word; add the same features, especially AI features, MCP, and platform integration." User delegated all decisions ("proceed with your best recommendations").

---

## 1. Audit summary (facts this design rests on)

Three deep audits (terminology, AI, MCP/integrations) established:

- **ConqrHub is far ahead on AI/MCP.** It ships a working EE AI subsystem: provider-agnostic LLM layer (openai/gemini/mistral/ollama/openai-compatible via Vercel AI SDK), pgvector RAG with permission-scoped citations, agentic AI Chat with a ~29-tool registry, a spec-compliant **MCP server** (JSON-RPC + streamable HTTP + OAuth 2.1/PKCE/dynamic client registration), STT, meeting transcription, per-workspace AI toggles (`generative, retrieval, search, chat, mcp, stt, meeting`).
- **Plane has only the community "ask GPT" assistant** (`GPTIntegrationEndpoint`, instance-config `LLM_PROVIDER/LLM_MODEL/LLM_API_KEY`, OpenAI/Anthropic/Gemini). Two paths are **broken in the fork**: the frontend calls `POST .../rephrase-grammar/` which does not exist in the API (404), and the page-editor "Ask Pi" menu is a dead stub (no submit handler; ASK_ANYTHING returns early). No embeddings, no vector infra, no MCP.
- **Plane's third-party integrations (Slack/GitHub/Jira) are dead stubs** — DB models with no registered endpoints, and web UI shells calling `/api/integrations/…` routes that don't exist (real engine, Silo, is EE-only and absent). Plane's real integration surface: public REST API `/api/v1/` (X-Api-Key), general-purpose outgoing webhooks, OAuth sign-in providers.
- **Hub's real integrations:** Notion/Confluence/MD/DOCX import, PDF/HTML/MD export, and the substantial Hub↔Plane integration layer (`core/integration/`: URN relationship graph, project↔space mappings, work-item creation, federated search, requirement traceability, page promotion, webhook inbox with dead-letter/replay, SSE, delegated tokens).
- **Terminology:** Plane UI consistently says "Work item" (never "Issue" except GitHub/GitLab sync copy; `issue` survives only in i18n key *names*). Hub = flat English-as-key `translation.json` (~918 entries, ~1,621 `t()` sites, catalog partial — fallback-to-key renders English); Plane = namespaced semantic keys (`packages/i18n/src/locales/en/*.json`, ~6,600 lines, near-complete). Collisions: **Page** (Hub canonical doc vs Plane lightweight notes), **Space** (Hub container vs Plane "Teamspace"/borrowed "Documentation spaces"), **Group** (Hub permission group vs Plane group-by), **Draft** (Hub approval status vs Plane draft work items), **View** (Plane noun vs Hub verb), **State vs Status**.

## 2. Goals

1. One word per concept across the suite; collisions resolved or explicitly qualified; a canonical glossary both repos reference.
2. Feature parity where it makes product sense: Plane users get working AI, MCP/agent access, and honest integration surfaces; the suite reads as one product.

Non-goals: renaming Plane's internal i18n keys (`issue.*` — purely internal, 19-locale churn, zero user value); porting Hub's full AI stack into Django; building Slack/GitHub sync from scratch.

## 3. Approaches considered

- **A. Suite-brain (RECOMMENDED):** Hub's AI/MCP subsystem becomes the suite's brain. Plane's native assistant is fixed and rebranded; cross-product reach (work items, projects, cycles) is added as tools in Hub's chat/MCP registry via the existing `PlaneClientService` + project↔space mappings + delegated tokens. One MCP endpoint serves the whole suite; Plane gets a settings surface pointing agents at it.
- **B. Full port:** replicate RAG/chat/embeddings/MCP+OAuth in Django. Rejected: months of duplication, two vector stores, two OAuth servers, no product benefit over A.
- **C. Sidecar MCP:** standalone Node MCP server wrapping Plane `/api/v1`. Deferred: another deployable; doesn't unify the assistant. Can be added later without conflict.

**Decision: A**, with C noted as a future option.

## 4. Design — Part 1: Terminology

### 4.1 Canonical suite glossary (new doc: `docs/Conqr-Suite-Glossary.md` in ConqrHub, referenced from plane repo)

| Concept | Suite term | Notes |
|---|---|---|
| Tenant | **Workspace** | Same word both sides today; glossary notes they are separate records linked by the integration layer. |
| Work container | **Project** | Plane-only object. |
| Docs container | **Space** | Hub-only object. Plane refers to Hub spaces only as **"Documentation spaces"** (already does). Plane's "Teamspace" keeps its compound name (distinct object). |
| Canonical document | **Page** | Hub object. In Plane UI, "Page(s)"/"Docs" must never refer to Plane-native notes. |
| Plane-native notes | **Project Notes** | Per blueprint §4; every Plane-native pages surface (nav, wiki namespace labels, empty states, power-k) says "Project Notes". "Docs" in Plane = the mapped ConqrHub space only. |
| Trackable work | **Work item** | Already consistent in Plane values. "Issue" allowed only when naming external GitHub/GitLab objects. |
| Iteration | **Cycle** | Plane-only. "Sprint" never used as a noun (already true). |
| Work-item workflow status | **State** | Plane-only object. Hub's page approval lifecycle is **"Approval status"** (Draft → In approval → Approved → Obsolete) — glossary declares these distinct concepts, so both words legitimately coexist. |
| Deleted-items area | **Trash** (Hub) / **Archive** (Plane) | Different semantics (recoverable deletion vs hide-completed); documented, not merged. |
| Permission group | **Group** | Hub object. Plane's "group by" is a verb; Plane "Teams/Teamspace" is a distinct people object. Glossary flags the difference. |
| AI assistant | **Conqr AI** | Replaces "Pi"/"Plane AI" labels in Plane and Hub's inconsistent AI titles (e.g. `"Conqrai AI": "ConqrHub"`). |
| Suite / products | **Conqr suite**; **ConqrHub** (Knowledge & documentation); **ConqrTasks** (Projects & work management) | The Plane fork's user-visible product name becomes **ConqrTasks** on high-visibility surfaces (Hub app-switcher tile, Plane sidebar wordmark/title, power-k, auth screens, conqr_* i18n blocks). Deep copy (marketing/upgrade strings) is out of scope this pass. |

### 4.2 Concrete term changes

**Plane (`packages/i18n/src/locales/en/*.json`, per the repo's `translate` skill):**
- All labels where Plane-native pages are called "Pages"/"Docs" → "Project Notes" (namespaces: `navigation`, `page`, `wiki`, `power-k`, `empty-state` as applicable). "Docs" remains only for the ConqrHub-mapped area.
- "Pi" / "Plane AI" assistant labels → "Conqr AI" (`packages/constants/src/ai.ts` LOADING_TEXTS, `ask-pi-menu.tsx` labels).
- Product-name strings on high-visibility surfaces → "ConqrTasks".
- English (`en`) locale is source of truth this pass; other 18 locales keep existing values for unchanged keys; changed/new keys get `en` values copied with a follow-up translation note (per translate-skill workflow).

**ConqrHub (`apps/client/public/locales/en-US/translation.json` + source `t()` keys):**
- Fix `"Conqrai AI": "ConqrHub"` and any assistant-name drift → "Conqr AI".
- App-switcher: raw literals (`"ConqrHub"`, `"Plane"`, `"Knowledge & documentation"`, `"Projects & work management"`, `"Open this space's project"`) moved into `t()` + catalog; "Plane" tile → "ConqrTasks".
- Add the known missing catalog entries surfaced by the audit (doc-health keys: "Score alerts", "Threshold", "Last fired", "Subscribe"; "Switch apps", "Conqr suite") so the catalog stops silently relying on fallback.
- Minor comment-wording harmonization: keep Hub "Add a comment…" (Plane's notify copy untouched — different context, not a collision).

### 4.3 Glossary enforcement
- `docs/Conqr-Suite-Glossary.md` committed in ConqrHub; `plane/CLAUDE.md`-adjacent note (or plane docs) links to it.
- The plane `translate` skill's do-not-translate terminology list gains the suite terms (Conqr AI, ConqrHub, ConqrTasks, Project Notes).

## 5. Design — Part 2: AI parity

### 5.1 Fix Plane's broken native AI (backend + editor)
- **New Django endpoint** `POST /api/workspaces/<slug>/projects/<id>/rephrase-grammar/` (and workspace-level twin) in `apps/api/plane/app/views/external/base.py` + URLs: accepts `{ text, task }` (task ∈ editor tasks), calls the existing `LLMProvider`/`get_llm_response()` machinery with task-specific prompts, returns `{ response, response_html }` shaped like the assistant endpoint. Same permission classes (ADMIN/MEMBER) and 400-when-unconfigured behavior as `GPTIntegrationEndpoint`.
- **Wire the editor AI menu** (`apps/web/core/components/pages/editor/ai/menu.tsx`, `ask-pi-menu.tsx`): ASK_ANYTHING submits to the assistant endpoint; tone/rephrase actions call the new endpoint via `AIService.performEditorTask`; response preview + insert/replace actions work; loading/error states; labels say "Conqr AI".
- Existing GPT popover (issue description) keeps working; labels swept to "Conqr AI".

### 5.2 Cross-product AI: suite assistant reaches Plane
- **New Hub chat tools** in `apps/server/src/ee/ai/chat/tools/` registered via `chat-tool.registry.ts` (thus automatically exposed over MCP too): `search_work_items`, `get_work_item`, `create_work_item`, `list_projects`, `get_project_status` (cycles/modules/progress summary). Implementation delegates to the existing integration layer (`PlaneClientService`, `ProjectSpaceMappingService`, `WorkItemCreationService`, `FederatedSearchService`) — no new Plane API surface needed.
- Tools are registered only when the integration is configured (`PLANE_API_URL/KEY/WORKSPACE_SLUG` present) — same guard the integration module already uses; otherwise the registry omits them (assistant degrades gracefully).
- Writes go through the existing delegated-token/on-behalf-of path where applicable; tool descriptions instruct the model to cite work-item URLs.

### 5.3 Stretch (explicitly deferred, not in this pass)
- Indexing Plane work items into Hub's `ai_embeddings` for semantic RAG. The federated-search tool covers retrieval adequately today.

## 6. Design — Part 3: MCP & platform integrations

### 6.1 Suite MCP
- Hub's MCP server + OAuth is the **one suite MCP endpoint**. The §5.2 tools make it cover Plane. Docs updated: `docs/reference/mcp-tools.md` gains the work-item tool section.

### 6.2 Plane-side MCP/agents surface (parity of discoverability)
- New Plane workspace-settings page **"Agents & MCP"** (`apps/web/.../settings/`): explains the suite MCP, shows the endpoint URL + connection snippets (mirroring Hub's `mcp-setup-snippets.tsx` content), links to Hub's MCP settings for tool toggles. Read-only informational page — no new backend.

### 6.3 Honest integration surfaces in Plane
- Remove/hide the dead Slack/GitHub/Jira integration UI (settings `integrations/page.tsx`, `components/integration/*`, services calling nonexistent endpoints). The integrations settings page instead shows: Conqr suite link status (mapped ConqrHub space via existing `conqr` components), webhooks, and API tokens — the things that actually work.

### 6.4 Deferred
- Hub general-purpose outgoing webhooks (Plane-style). Real work, separate project.
- Standalone sidecar Plane MCP server (approach C).

## 7. Error handling
- Plane `rephrase-grammar`: 400 with clear message when `LLM_API_KEY/LLM_MODEL` unset (mirrors assistant endpoint); frontend surfaces toast + keeps user text untouched.
- Hub Plane-tools: every tool returns structured `{ error }` on Plane API failure (timeouts, 401, integration_disabled) — never throws through the chat stream; MCP callers get JSON-RPC tool-error results.
- Tool registration guard prevents "configured-looking but dead" tools when integration env is absent.

## 8. Testing
- **Hub:** Jest unit tests for each new chat tool (mock PlaneClientService), registry-gating test (tools absent when integration unconfigured), existing 98-test suite stays green. Server+client `tsc`.
- **Plane backend:** endpoint test hitting `rephrase-grammar` with mocked LLM config (400 unconfigured path at minimum) — run inside the Docker toolchain.
- **Plane web:** typecheck/build via Docker (host node too old); live verification of editor AI menu + renamed labels via browser against the local stack.
- **Terminology:** grep-based sweep asserting no user-visible "Pi ", "Ask Pi", forbidden "Pages" labels in Plane-native-notes contexts; Hub catalog additions render (spot-check via browser).

## 9. Delivery order (slices)
1. **T1** Glossary doc + translate-skill terminology additions.
2. **T2** Plane en-locale term changes (Project Notes, Conqr AI, ConqrTasks surfaces).
3. **T3** Hub label fixes + catalog additions + app-switcher i18n/rename.
4. **A1** Plane `rephrase-grammar` endpoint + editor AI menu wiring.
5. **A2/M1** Hub cross-product chat/MCP tools + docs.
6. **M2** Plane "Agents & MCP" settings page.
7. **M3** Remove dead Plane integrations UI.

Each slice is independently shippable and verified before the next.
