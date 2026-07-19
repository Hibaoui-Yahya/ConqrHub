# Suite Terminology & Feature Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify terminology across ConqrHub and the Plane fork, and bring both to parity on AI, MCP, and integration surfaces per the spec at `docs/superpowers/specs/2026-07-19-suite-terminology-and-parity-design.md`.

**Architecture:** "Suite-brain" — ConqrHub's existing EE AI/MCP subsystem is the suite's brain. Plane's native assistant gets fixed and rebranded "Conqr AI"; cross-product reach is added as ConqrHub chat tools (auto-exposed over MCP) that call the existing `PlaneClientService`. Terminology is driven by a canonical glossary; Plane changes are i18n-JSON-first, Hub changes are `t()`-key + catalog edits.

**Tech Stack:** ConqrHub = NestJS/Fastify + Kysely + Jest + React/Mantine/i18next (flat English-as-key `translation.json`). Plane = Django/DRF + Next.js/MobX + `@plane/i18n` namespaced JSON.

## Global Constraints

- Two repos: `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\ConqrHub` (branch `main`) and `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane` (branch `conqr/integration`). Commit to each repo separately; never cross-commit.
- Suite terms (exact copy): assistant = **"Conqr AI"**; Plane fork product name = **"ConqrTasks"**; Plane-native pages = **"Project Notes"**; trackable work = **"Work item"**; Hub docs container = **"Space"**; canonical document = **"Page"**.
- Do NOT rename Plane's internal i18n key names (e.g. `issue.*`) — values only.
- Plane locale edits: `en` is source of truth; when touching `packages/i18n/src/locales`, follow the plane repo's `translate` skill rules (preserve placeholders/tags; do not translate product names).
- Hub host toolchain works (node 20 OK). Plane web builds need node ≥22.18 — typecheck/build via Docker if host `npx tsc` fails; do not `pnpm install` in plane on host.
- Hub server tests: `cd apps/server && pnpm run test` must stay green (currently 19+ suites pass).
- ConqrHub EE paths (`apps/server/src/ee/`, `apps/client/src/ee/`) are enterprise-licensed; core paths are AGPL. New Hub chat tools go in `ee/ai/chat/tools/` (existing pattern).
- Windows/PowerShell environment; in Git Bash prefix docker exec with `MSYS_NO_PATHCONV=1`.

---

### Task 1: Canonical suite glossary + translate-skill terminology

**Files:**
- Create: `ConqrHub/docs/Conqr-Suite-Glossary.md`
- Modify: `plane/.claude/skills/translate/SKILL.md` (add suite terms to do-not-translate list)
- Modify: `plane/CLAUDE.md` (one pointer line; create the file ONLY if it already exists — if absent, put the pointer in `plane/README.md` instead under a "Conqr suite" note)

**Interfaces:**
- Produces: the glossary table every later task's copy decisions follow.

- [ ] **Step 1: Write the glossary**

Create `ConqrHub/docs/Conqr-Suite-Glossary.md` with exactly the §4.1 table from the spec (copy it verbatim from `docs/superpowers/specs/2026-07-19-suite-terminology-and-parity-design.md`), preceded by:

```markdown
# Conqr Suite Glossary

One word per concept across ConqrHub and ConqrTasks (the Plane fork). UI copy,
docs, and i18n values in BOTH repos must use these terms. Internal identifiers
(i18n key names, DB columns, API fields like `issue_id`) are exempt.

<the spec §4.1 table>

## Collision rules
- "Page(s)" in ConqrTasks UI may only refer to canonical ConqrHub pages. Plane-native notes are always "Project Notes".
- "Docs" in ConqrTasks = the mapped ConqrHub space, nothing else.
- "Issue" may appear only when naming external GitHub/GitLab objects.
- Hub page approval lifecycle ("Approval status": Draft → In approval → Approved → Obsolete) is distinct from ConqrTasks work-item "State" — do not merge the words.
- The assistant is "Conqr AI" everywhere (never "Pi", "Plane AI", "Conqrai AI").
```

- [ ] **Step 2: Add do-not-translate terms to the plane translate skill**

In `plane/.claude/skills/translate/SKILL.md`, find the do-not-translate / terminology section and add: `Conqr`, `Conqr AI`, `ConqrHub`, `ConqrTasks`, `Project Notes` (Project Notes translates the common-noun part per locale rules only if the section's existing entries do; otherwise list as keep-verbatim). Follow the file's existing list format.

- [ ] **Step 3: Pointer from the plane repo**

Add one line to `plane/CLAUDE.md` (or `plane/README.md` if no CLAUDE.md exists): `Suite terminology is canonical in ../ConqrHub/docs/Conqr-Suite-Glossary.md — UI copy must follow it.`

- [ ] **Step 4: Commit (both repos)**

```bash
cd ConqrHub && git add docs/Conqr-Suite-Glossary.md && git commit -m "docs: canonical Conqr suite glossary"
cd ../plane && git add -A .claude CLAUDE.md README.md && git commit -m "docs: adopt Conqr suite glossary terminology"
```

---

### Task 2: Plane en-locale terminology sweep (Project Notes, Conqr AI, ConqrTasks)

**Files:**
- Modify: `plane/packages/constants/src/ai.ts`
- Modify: `plane/apps/web/core/components/pages/editor/ai/menu.tsx:42,268`
- Modify: `plane/packages/i18n/src/locales/en/*.json` (targets found by the greps below)

**Interfaces:**
- Consumes: glossary from Task 1.
- Produces: no code interfaces; UI copy only. (Task 5 will re-touch `menu.tsx` — keep label changes minimal here: strings only, no logic.)

- [ ] **Step 1: Rebrand assistant strings in code**

`plane/packages/constants/src/ai.ts`:
```ts
export const LOADING_TEXTS = {
  [AI_EDITOR_TASKS.ASK_ANYTHING]: "Conqr AI is generating a response",
} satisfies { [key in AI_EDITOR_TASKS]: string };
```
`menu.tsx` line 42: `label: "Ask Pi",` → `label: "Ask Conqr AI",`
`menu.tsx` line 268 fallback: `"Pi is writing"` → `"Conqr AI is writing"`.

- [ ] **Step 2: Sweep for remaining assistant-brand strings**

Run (from `plane/`): `rg -n '\bPi is|Ask Pi|Plane AI|"Pi"' apps/web packages --glob '!**/locales/!(en)/**'`
Fix every user-visible hit to "Conqr AI" phrasing. Expected: only the two files above plus possibly `packages/i18n/src/locales/en/*.json` hits; leave non-en locales untouched.

- [ ] **Step 3: Project Notes label audit + fix**

Run: `rg -n '"(Pages|Docs|Wiki)"' packages/i18n/src/locales/en/` and `rg -n 'sidebar\.pages|sidebar\.docs|sidebar\.project_notes' apps/web --type tsx --type ts`
Decision rule per hit: if the label names Plane-native pages/wiki (`navigation.json` `sidebar.pages`, `wiki.json` feature labels, page empty-states) → value becomes "Project Notes" (or "Project Note" singular). If it names the ConqrHub-mapped docs area (`sidebar.docs`, `conqr_docs.*`) → keep "Docs". Record each change in the commit message body.

- [ ] **Step 4: ConqrTasks product name on high-visibility surfaces**

Run: `rg -n '"[^"]*\bPlane\b[^"]*"' packages/i18n/src/locales/en/navigation.json packages/i18n/src/locales/en/auth.json packages/i18n/src/locales/en/common.json apps/web/core/components/conqr apps/web/core/components/workspace/logo.tsx 2>/dev/null`
Rename product-name occurrences to "ConqrTasks" ONLY on: sidebar/app title, auth screens, page `<title>`/PageHead defaults, power-k labels, conqr_* i18n blocks. Do NOT touch: upgrade/billing copy ("Plane Pro"), URLs, legal text, code identifiers. List every change in the commit body.

- [ ] **Step 5: Verify + commit**

Verify: `rg -n 'Ask Pi|Pi is generating|Pi is writing' apps/web packages` returns nothing.
```bash
cd plane && git add -A packages/constants packages/i18n apps/web && git commit -m "i18n: suite terminology — Conqr AI, Project Notes, ConqrTasks surfaces"
```

---

### Task 3: ConqrHub label fixes + app-switcher rename

**Files:**
- Modify: `ConqrHub/apps/client/public/locales/en-US/translation.json`
- Modify: `ConqrHub/apps/client/src/components/layouts/global/app-switcher.tsx`

**Interfaces:**
- Consumes: glossary (Task 1).
- Produces: catalog keys `"ConqrTasks"`, `"Knowledge & documentation"`, `"Projects & work management"`, `"Open this space's project"`, `"Switch apps"`, `"Conqr suite"`, `"Conqr AI"`, doc-health keys.

- [ ] **Step 1: Fix assistant naming in catalog**

In `translation.json`, find `"Conqrai AI": "ConqrHub"` and change the VALUE to `"Conqr AI"`. Then run `rg -n 'Conqrai|"ConqrHub AI"' apps/client/src apps/client/public/locales/en-US` and normalize any other assistant-title strings to "Conqr AI" (assistant only — not product-name uses of "ConqrHub").

- [ ] **Step 2: Add missing catalog entries**

Add to `translation.json` (alphabetical placement not required; append near related keys), each key = value:
`"Score alerts"`, `"Threshold"`, `"Last fired"`, `"Subscribe"`, `"Switch apps"`, `"Conqr suite"`, `"ConqrTasks"`, `"Knowledge & documentation"`, `"Projects & work management"`, `"Open this space's project"`.

- [ ] **Step 3: app-switcher — i18n + ConqrTasks**

In `app-switcher.tsx`, `useSuiteApps()` must accept `t` (pass from caller or call `useTranslation()` inside the hook) and return:
```tsx
{
  key: "hub",
  name: "ConqrHub",
  desc: t("Knowledge & documentation"),
  ...
},
{
  key: "plane",
  name: t("ConqrTasks"),
  desc: planeContextual ? t("Open this space's project") : t("Projects & work management"),
  ...
}
```
(`"ConqrHub"` stays a literal — proper noun, same in every locale; `ConqrTasks` goes through `t()` only because the key exists — value identical.)

- [ ] **Step 4: Verify — client typecheck + tests**

Run: `cd ConqrHub && pnpm --filter client exec tsc --noEmit` (or the repo's client typecheck script). Expected: clean.
Run: `cd apps/server && pnpm run test` — expected: all suites pass (no server change, sanity gate).

- [ ] **Step 5: Commit**

```bash
cd ConqrHub && git add apps/client && git commit -m "i18n: Conqr AI naming, ConqrTasks switcher tile, missing catalog entries"
```

---

### Task 4: Plane backend — `rephrase-grammar` editor endpoint

**Files:**
- Modify: `plane/apps/api/plane/app/views/external/base.py`
- Modify: `plane/apps/api/plane/app/urls/external.py`
- Modify: `plane/apps/api/plane/app/views/__init__.py` (export the new view; mirror how `WorkspaceGPTIntegrationEndpoint` is exported)
- Test: `plane/apps/api/plane/tests/` — locate existing test layout with `ls plane/apps/api/plane/tests` and place `test_editor_ai.py` following the existing pattern; if no test infra is runnable, verification falls back to a live curl (Step 5).

**Interfaces:**
- Produces: `POST /api/workspaces/<slug>/rephrase-grammar/` accepting `{ task: str, text_input: str, casual_score?: int, formal_score?: int, query?: str }`, returning `{ response: str, response_html: str }`; 400 `{"error": "LLM provider API key and model are required"}` when unconfigured; 400 `{"error": "task and text_input are required"}` on bad input.
- Consumes: existing `get_llm_config()`, `get_llm_response()` in the same file.

- [ ] **Step 1: Add task prompt map + endpoint**

Append to `base.py`:

```python
EDITOR_TASK_PROMPTS = {
    "ASK_ANYTHING": "Answer the request about the following text.",
    "IMPROVE_WRITING": "Improve the writing of the following text. Keep the meaning, language, and approximate length. Return only the improved text.",
    "FIX_SPELLING_GRAMMAR": "Fix spelling and grammar mistakes in the following text. Return only the corrected text.",
    "SHORTEN": "Make the following text shorter while preserving all key information. Return only the shortened text.",
    "EXPAND": "Expand the following text with more detail, keeping its tone. Return only the expanded text.",
    "SIMPLIFY": "Simplify the following text so it is easy to read. Return only the simplified text.",
    "CHANGE_TONE": "Rewrite the following text adjusting tone. On a 0-10 scale it should be casual={casual} and formal={formal}. Return only the rewritten text.",
}


class EditorAITaskEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        api_key, model, provider = get_llm_config()
        if not api_key or not model or not provider:
            return Response(
                {"error": "LLM provider API key and model are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        task = request.data.get("task")
        text_input = request.data.get("text_input")
        if not task or not text_input:
            return Response(
                {"error": "task and text_input are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Tone scores turn any task into a tone rewrite when provided.
        casual = request.data.get("casual_score")
        formal = request.data.get("formal_score")
        if casual is not None or formal is not None:
            instruction = EDITOR_TASK_PROMPTS["CHANGE_TONE"].format(
                casual=casual if casual is not None else 5,
                formal=formal if formal is not None else 5,
            )
        else:
            instruction = EDITOR_TASK_PROMPTS.get(task)
        if not instruction:
            return Response(
                {"error": f"Unsupported task: {task}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = request.data.get("query")
        if task == "ASK_ANYTHING" and query:
            instruction = f"{instruction}\nRequest: {query}"

        text, error = get_llm_response(instruction, text_input, api_key, model, provider)
        if not text and error:
            return Response(
                {"error": "An internal error has occurred."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {"response": text, "response_html": text.replace("\n", "<br/>")},
            status=status.HTTP_200_OK,
        )
```

- [ ] **Step 2: Route it**

`urls/external.py` — add import `EditorAITaskEndpoint` and:
```python
path(
    "workspaces/<str:slug>/rephrase-grammar/",
    EditorAITaskEndpoint.as_view(),
    name="editor-ai-task",
),
```
Export `EditorAITaskEndpoint` from `plane/app/views/__init__.py` next to `WorkspaceGPTIntegrationEndpoint` (find it with `rg -n "WorkspaceGPTIntegrationEndpoint" apps/api/plane/app/views/__init__.py`).

- [ ] **Step 3: Write the test**

Follow existing API test conventions (`rg -l "BaseAPIView" apps/api/plane/tests | head -3` to find a template). Minimum test: unauthenticated/unconfigured behavior —

```python
def test_editor_ai_requires_llm_config(self):
    # no LLM_API_KEY configured in test settings
    url = f"/api/workspaces/{self.workspace.slug}/rephrase-grammar/"
    response = self.client.post(url, {"task": "IMPROVE_WRITING", "text_input": "helo"}, format="json")
    self.assertEqual(response.status_code, 400)
```

- [ ] **Step 4: Run the test (Docker toolchain)**

Primary: `docker compose -p plane -f plane/deployments/cli/community/docker-compose.yml exec api python manage.py test plane.tests -k editor_ai` (adjust service name via `docker compose -p plane ps`).
Fallback if the running container lacks test deps: `python -m py_compile apps/api/plane/app/views/external/base.py apps/api/plane/app/urls/external.py` for syntax, plus Step 5 live check after deploy.

- [ ] **Step 5: Live verification of the 400 contract**

Against the running local Plane API: `curl -s -X POST http://localhost/api/workspaces/<slug>/rephrase-grammar/ -H "Content-Type: application/json" -d '{"task":"IMPROVE_WRITING","text_input":"helo"}' -b <session cookie>` → expect 400 JSON (unconfigured LLM), NOT 404. The 404→400 change is the fix being proven.

- [ ] **Step 6: Commit**

```bash
cd plane && git add apps/api && git commit -m "feat(api): editor AI task endpoint — fixes 404 rephrase-grammar path"
```

---

### Task 5: Plane frontend — working Conqr AI editor menu

**Files:**
- Modify: `plane/packages/constants/src/ai.ts`
- Modify: `plane/apps/web/core/services/ai.service.ts`
- Modify: `plane/apps/web/core/components/pages/editor/ai/menu.tsx`
- Modify: `plane/apps/web/core/components/pages/editor/ai/ask-pi-menu.tsx` (rename export to `AskConqrAiMenu`; keep filename to minimize churn)

**Interfaces:**
- Consumes: Task 4's endpoint contract (`{task, text_input, casual_score?, formal_score?, query?}` → `{response}`); existing `AIService.performEditorTask` already posts to `/api/workspaces/${slug}/rephrase-grammar/`.
- Produces: `TTaskPayload` gains `query?: string`. `AskConqrAiMenu` gains prop `handleAsk: (query: string) => Promise<void>`.

- [ ] **Step 1: Extend the task enum + loading texts**

`packages/constants/src/ai.ts`:
```ts
export enum AI_EDITOR_TASKS {
  ASK_ANYTHING = "ASK_ANYTHING",
  IMPROVE_WRITING = "IMPROVE_WRITING",
  FIX_SPELLING_GRAMMAR = "FIX_SPELLING_GRAMMAR",
  SHORTEN = "SHORTEN",
  EXPAND = "EXPAND",
  SIMPLIFY = "SIMPLIFY",
}

export const LOADING_TEXTS = {
  [AI_EDITOR_TASKS.ASK_ANYTHING]: "Conqr AI is generating a response",
  [AI_EDITOR_TASKS.IMPROVE_WRITING]: "Conqr AI is improving the writing",
  [AI_EDITOR_TASKS.FIX_SPELLING_GRAMMAR]: "Conqr AI is fixing spelling and grammar",
  [AI_EDITOR_TASKS.SHORTEN]: "Conqr AI is shortening the text",
  [AI_EDITOR_TASKS.EXPAND]: "Conqr AI is expanding the text",
  [AI_EDITOR_TASKS.SIMPLIFY]: "Conqr AI is simplifying the text",
} satisfies { [key in AI_EDITOR_TASKS]: string };
```

- [ ] **Step 2: Service payload**

`ai.service.ts`: add `query?: string;` to `TTaskPayload`.

- [ ] **Step 3: Menu items + ask wiring in `menu.tsx`**

- `MENU_ITEMS`: add entries `{key: IMPROVE_WRITING, icon: Sparkles, label: "Improve writing"}`, `{key: FIX_SPELLING_GRAMMAR, icon: Sparkles, label: "Fix spelling & grammar"}`, `{key: SHORTEN, icon: Sparkles, label: "Make shorter"}`, `{key: EXPAND, icon: Sparkles, label: "Make longer"}`, `{key: SIMPLIFY, icon: Sparkles, label: "Simplify"}` after the existing ASK_ANYTHING item (import additional lucide icons if nicer: `Wand2`, `SpellCheck`, `AlignVerticalSpaceAround`, `AlignVerticalSpaceBetween`, `Eraser` — any that exist in the installed lucide version; verify with `rg '"lucide-react"' apps/web/package.json` and keep `Sparkles` where unsure).
- Add error handling to `handleGenerateResponse`:
```tsx
const [error, setError] = useState<string | undefined>(undefined);
const handleGenerateResponse = async (payload: TTaskPayload) => {
  if (!workspaceSlug) return;
  setError(undefined);
  await aiService
    .performEditorTask(workspaceSlug.toString(), payload)
    .then((res) => setResponse(res.response))
    .catch((err) => setError(err?.error ?? "Conqr AI request failed"));
};
```
Render `error` in the response panel (`<p className="text-13 text-danger-primary">{error}</p>`) when set — place where the loading text renders, taking priority over it.
- Add ask handler and pass to the ask menu:
```tsx
const handleAsk = async (query: string) => {
  const selection = editorRef?.getSelectedText() ?? "";
  setResponse(undefined);
  await handleGenerateResponse({ task: AI_EDITOR_TASKS.ASK_ANYTHING, text_input: selection, query });
};
```
Pass `handleAsk={handleAsk}` to `AskConqrAiMenu` (renamed import).

- [ ] **Step 4: Wire the ask input in `ask-pi-menu.tsx`**

Rename component `AskPiMenu` → `AskConqrAiMenu`. Add prop `handleAsk: (query: string) => Promise<void>` and submitting state; make the input a form:
```tsx
const [isSubmitting, setIsSubmitting] = useState(false);
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!query.trim() || isSubmitting) return;
  setIsSubmitting(true);
  await handleAsk(query).finally(() => setIsSubmitting(false));
};
```
Wrap the input row in `<form onSubmit={handleSubmit}>`, make the `CircleArrowUp` a `<button type="submit">`, placeholder → `"Tell Conqr AI what to do..."`, waiting copy `"AI is answering..."` → `"Conqr AI is answering..."`, and only show the waiting copy while `isSubmitting` (initial state shows a hint `"Ask Conqr AI about the selection"`).

- [ ] **Step 5: Typecheck**

Try host: `cd plane && npx tsc --noEmit -p apps/web/tsconfig.json`. If the toolchain refuses on node 20, run the repo's docker web build (`docker build` with the web Dockerfile used for `conqr/plane-web:local`) and treat compile success as the gate.

- [ ] **Step 6: Commit**

```bash
cd plane && git add packages/constants apps/web && git commit -m "feat(web): working Conqr AI editor menu — ask, improve, fix, shorten, expand, simplify"
```

---

### Task 6: ConqrHub — cross-product work-item tools (chat + MCP)

**Files:**
- Modify: `ConqrHub/apps/server/src/core/integration/services/plane-client.service.ts` (add `listProjects`, `listCycles`)
- Create: `ConqrHub/apps/server/src/ee/ai/chat/tools/plane-work-items.tools.ts` (5 tools in one focused file — they share the client and the gating rule)
- Create: `ConqrHub/apps/server/src/ee/ai/chat/tools/plane-work-items.tools.spec.ts`
- Modify: `ConqrHub/apps/server/src/ee/ai/chat/ai-chat.module.ts`
- Modify: `ConqrHub/docs/reference/mcp-tools.md` (append a "ConqrTasks work-item tools" section listing the 5 tools + note they appear only when the integration is configured)

**Interfaces:**
- Consumes: `PlaneClientService.isEnabled(): boolean`, `getWorkItem(projectId, workItemId)`, `createWorkItem(projectId, {name, description_html?, priority?})`, `listWorkItems(projectId, {search?, perPage?})` — all existing; `ChatTool`/`ChatToolContext` from `chat-tool.types.ts`; `ChatToolRegistry.register()`.
- Produces: new `PlaneClientService.listProjects(): Promise<{id: string; name: string; identifier?: string}[]>` and `listCycles(projectId: string): Promise<{id: string; name: string; start_date?: string|null; end_date?: string|null}[]>`; tools named `list_conqrtasks_projects`, `search_work_items`, `get_work_item`, `create_work_item`, `get_project_cycles`.

- [ ] **Step 1: Failing spec first**

`plane-work-items.tools.spec.ts` (mirror the style of `list-spaces.tool.spec.ts` — read it first). Cover:

```ts
describe('Plane work-item tools', () => {
  // registration gating
  it('does not register any tool when the integration is disabled', () => {
    // planeClient.isEnabled() → false; construct tools with a fresh ChatToolRegistry;
    // call onModuleInit on each; expect registry.getAll()).toHaveLength(0)
  });
  it('registers all five tools when the integration is enabled', () => {
    // isEnabled() → true; expect names to equal the five tool names
  });
  // behavior (mock PlaneClientService)
  it('search_work_items returns trimmed work items', async () => {
    // listWorkItems resolves {results: [{id, name, sequence_id, state_detail, priority, updated_at}]}
    // expect execute() to map to {id, name, sequenceId, state, priority, updatedAt}
  });
  it('create_work_item passes name/description/priority to the client', async () => {});
  it('tools surface PlaneApiError as a structured error object, not a throw-through of internals', async () => {
    // listWorkItems rejects with PlaneApiError('..',503,false)
    // expect execute() to resolve to { error: expect.stringContaining('ConqrTasks') }
  });
});
```

Run: `cd ConqrHub/apps/server && pnpm run test -- plane-work-items` — expected FAIL (file not found / tools undefined).

- [ ] **Step 2: Extend PlaneClientService**

Append to `plane-client.service.ts` (same pattern as `listWorkItems`):

```ts
/** List projects in the configured workspace (suite AI/MCP tools). */
async listProjects(workspaceSlug?: string): Promise<{ id: string; name: string; identifier?: string }[]> {
  const slug = workspaceSlug || this.environment.getPlaneWorkspaceSlug();
  const res = await this.request<{ results?: any[] } | any[]>(`/workspaces/${slug}/projects/`);
  const results = Array.isArray(res) ? res : (res.results ?? []);
  return results.map((p: any) => ({ id: p.id, name: p.name, identifier: p.identifier }));
}

/** List cycles for a project (suite AI/MCP tools). */
async listCycles(
  projectId: string,
  workspaceSlug?: string,
): Promise<{ id: string; name: string; start_date?: string | null; end_date?: string | null }[]> {
  const slug = workspaceSlug || this.environment.getPlaneWorkspaceSlug();
  const res = await this.request<{ results?: any[] } | any[]>(
    `/workspaces/${slug}/projects/${projectId}/cycles/`,
  );
  const results = Array.isArray(res) ? res : (res.results ?? []);
  return results.map((c: any) => ({
    id: c.id,
    name: c.name,
    start_date: c.start_date ?? null,
    end_date: c.end_date ?? null,
  }));
}
```

- [ ] **Step 3: Implement the tools file**

`plane-work-items.tools.ts` — five `@Injectable()` classes implementing `ChatTool, OnModuleInit`, each with the conditional registration and a shared error helper:

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  PlaneApiError,
  PlaneClientService,
} from '../../../../core/integration/services/plane-client.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

/**
 * Cross-product tools: let the suite assistant (chat + MCP) read and create
 * ConqrTasks work items through the integration layer's Plane REST adapter.
 * Registered only when the Plane integration is configured, so an
 * unconfigured deployment never advertises dead tools.
 */
function toolError(err: unknown): { error: string } {
  if (err instanceof PlaneApiError) {
    return { error: `ConqrTasks request failed (${err.status || 'network'}): ${err.message}` };
  }
  return { error: `ConqrTasks request failed: ${err instanceof Error ? err.message : String(err)}` };
}

const workItemSummary = (w: any) => ({
  id: w.id,
  name: w.name,
  sequenceId: w.sequence_id,
  state: w.state_detail?.name ?? w.state ?? null,
  priority: w.priority ?? null,
  updatedAt: w.updated_at ?? null,
});

@Injectable()
export class ListConqrTasksProjectsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_conqrtasks_projects';
  readonly description =
    'List projects in ConqrTasks (the Conqr suite work-management app). Use this to find a project ID before searching or creating work items.';
  readonly parameters = z.object({});
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(_args: unknown, _ctx: ChatToolContext) {
    try {
      return await this.plane.listProjects();
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class SearchWorkItemsTool implements ChatTool, OnModuleInit {
  readonly name = 'search_work_items';
  readonly description =
    'Search work items in a ConqrTasks project by text. Returns id, name, state, and priority. Cite work items by name and sequenceId.';
  readonly parameters = z.object({
    projectId: z.string().describe('ConqrTasks project ID (from list_conqrtasks_projects)'),
    query: z.string().optional().describe('Text to search work item names for'),
    limit: z.number().int().min(1).max(50).optional().default(20),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; query?: string; limit?: number }, _ctx: ChatToolContext) {
    try {
      const { results } = await this.plane.listWorkItems(args.projectId, {
        search: args.query,
        perPage: args.limit ?? 20,
      });
      return results.map(workItemSummary);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class GetWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'get_work_item';
  readonly description = 'Get one ConqrTasks work item with its description, state, and priority.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; workItemId: string }, _ctx: ChatToolContext) {
    try {
      const w = await this.plane.getWorkItem(args.projectId, args.workItemId);
      return { ...workItemSummary(w), description: w.description_stripped ?? null };
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class CreateWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'create_work_item';
  readonly description =
    'Create a work item in a ConqrTasks project. Use only when the user explicitly asks to create work. Returns the created item.';
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    description: z.string().optional().describe('Plain-text or HTML description'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId: string; name: string; description?: string; priority?: string },
    ctx: ChatToolContext,
  ) {
    try {
      const w = await this.plane.createWorkItem(
        args.projectId,
        {
          name: args.name,
          description_html: args.description ? `<p>${args.description}</p>` : undefined,
          priority: args.priority,
        },
        { onBehalfOf: ctx.user.id },
      );
      return workItemSummary(w);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class GetProjectCyclesTool implements ChatTool, OnModuleInit {
  readonly name = 'get_project_cycles';
  readonly description =
    'List cycles (iterations) of a ConqrTasks project with their date ranges. Use for status questions like "what is in the current cycle".';
  readonly parameters = z.object({ projectId: z.string() });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string }, _ctx: ChatToolContext) {
    try {
      return await this.plane.listCycles(args.projectId);
    } catch (err) {
      return toolError(err);
    }
  }
}

export const PLANE_WORK_ITEM_TOOLS = [
  ListConqrTasksProjectsTool,
  SearchWorkItemsTool,
  GetWorkItemTool,
  CreateWorkItemTool,
  GetProjectCyclesTool,
];
```

Note on HTML: `description_html` wraps plain text in `<p>` — if the description already contains `<`, pass it through unchanged (add `const html = args.description?.trim().startsWith('<') ? args.description : \`<p>${args.description}</p>\`` and use `html`). Include this in the implementation.

- [ ] **Step 4: Wire the module**

`ai-chat.module.ts`: add `import { IntegrationModule } from '../../../core/integration/integration.module';` and `import { PLANE_WORK_ITEM_TOOLS } from './tools/plane-work-items.tools';`. Add `IntegrationModule` to `imports` and `...PLANE_WORK_ITEM_TOOLS` to `providers`. **Check first** that `IntegrationModule` exports `PlaneClientService` (`rg -n "PlaneClientService" apps/server/src/core/integration/integration.module.ts`) — it currently does NOT (exports list lacks it); add `PlaneClientService` to the module's `exports` array.

- [ ] **Step 5: Run tests**

`cd ConqrHub/apps/server && pnpm run test -- plane-work-items` → PASS. Then full: `pnpm run test` → all suites green. Then `pnpm run build` (nest build) → clean.

- [ ] **Step 6: Update MCP docs + commit**

Append to `docs/reference/mcp-tools.md` a section "ConqrTasks work-item tools" documenting the five tools (name, params, returns, gating note: present only when `PLANE_API_URL`/`PLANE_API_KEY`/`PLANE_WORKSPACE_SLUG` are configured).

```bash
cd ConqrHub && git add apps/server docs/reference/mcp-tools.md && git commit -m "feat(ai): ConqrTasks work-item tools in suite chat + MCP"
```

---

### Task 7: Plane — "Agents & MCP" workspace settings page

**Files:**
- Modify: `plane/packages/types/src/settings.ts:13` (add `"agents-mcp"` to `TWorkspaceSettingsTabs`)
- Modify: `plane/packages/constants/src/settings/workspace.ts` (add entry + group under DEVELOPER)
- Modify: `plane/packages/i18n/src/locales/en/workspace-settings.json` (new title key; follow the `settings.webhooks.title` structure — confirm with `rg -n '"webhooks"' packages/i18n/src/locales/en/workspace-settings.json`)
- Create: `plane/apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/agents-mcp/page.tsx`
- Check: `plane/apps/web/core/components/settings/workspace/sidebar/item-icon.tsx` (add an icon case for the new key if the sidebar maps icons by key)

**Interfaces:**
- Consumes: `CONQR_HUB_URL` from `apps/web/core/components/conqr/conqr-hub-client.ts`; `WORKSPACE_SETTINGS` constants pattern (Task 7 mirrors the `webhooks` entry exactly).
- Produces: route `/[workspaceSlug]/settings/agents-mcp/`.

- [ ] **Step 1: Type + constants**

`settings.ts:13`: `... | "webhooks" | "agents-mcp";`
`workspace.ts` — add after `webhooks`:
```ts
"agents-mcp": {
  key: "agents-mcp",
  i18n_label: "workspace_settings.settings.agents_mcp.title",
  href: `/settings/agents-mcp`,
  access: [EUserWorkspaceRoles.ADMIN],
  highlight: (pathname: string, baseUrl: string) => pathname === `${baseUrl}/settings/agents-mcp/`,
},
```
and `GROUPED_WORKSPACE_SETTINGS` DEVELOPER array → `[WORKSPACE_SETTINGS["webhooks"], WORKSPACE_SETTINGS["agents-mcp"]]`.
i18n: add `"agents_mcp": { "title": "Agents & MCP" }` under the same parent object as `webhooks` in `workspace-settings.json`.

- [ ] **Step 2: The page**

`agents-mcp/page.tsx` — informational page, admin-gated like the integrations page (reuse `NotAuthorizedView`, `PageHead` imports from `../integrations/page.tsx` pattern):

```tsx
"use client";

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { CONQR_HUB_URL } from "@/components/conqr/conqr-hub-client";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";

function AgentsMcpSettingsPage() {
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Agents & MCP` : undefined;
  if (!isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  const mcpUrl = CONQR_HUB_URL ? `${CONQR_HUB_URL.replace(/\/$/, "")}/mcp` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <section className="w-full overflow-y-auto">
        <div className="border-b border-subtle pb-3">
          <h3 className="text-xl font-medium">Agents &amp; MCP</h3>
          <p className="text-sm text-secondary">
            AI agents connect to the Conqr suite through one MCP endpoint, hosted by ConqrHub. It exposes
            documentation tools and ConqrTasks work-item tools (search, create, cycles) with OAuth sign-in.
          </p>
        </div>
        {mcpUrl ? (
          <div className="my-4 space-y-3">
            <div>
              <p className="text-sm font-medium">MCP endpoint</p>
              <code className="mt-1 block w-fit rounded-sm bg-layer-1 px-2 py-1 text-13">{mcpUrl}</code>
            </div>
            <div>
              <p className="text-sm font-medium">Connect (Claude Code)</p>
              <pre className="mt-1 w-fit rounded-sm bg-layer-1 px-2 py-1 text-13">{`claude mcp add conqr --transport http ${mcpUrl}`}</pre>
            </div>
            <p className="text-sm text-secondary">
              Tool toggles and OAuth client management live in ConqrHub → Settings → AI → MCP.
            </p>
          </div>
        ) : (
          <p className="my-4 text-sm text-secondary">
            ConqrHub is not configured for this deployment (VITE_CONQR_HUB_URL is unset), so the suite MCP
            endpoint is unavailable.
          </p>
        )}
      </section>
    </>
  );
}

export default observer(AgentsMcpSettingsPage);
```

Adjust imports/props to match what `../integrations/page.tsx` actually uses in this codebase (e.g. `NotAuthorizedView` props). If the settings sidebar requires an icon per key (`item-icon.tsx` switch), add a `Bot` lucide icon case for `"agents-mcp"`.

- [ ] **Step 3: Typecheck + commit**

Typecheck as in Task 5 Step 5. Then:
```bash
cd plane && git add packages/types packages/constants packages/i18n apps/web && git commit -m "feat(web): Agents & MCP workspace settings page pointing at the suite MCP endpoint"
```

---

### Task 8: Plane — remove dead third-party integrations UI

**Files:**
- Delete: `plane/apps/web/app/(all)/[workspaceSlug]/(settings)/settings/(workspace)/integrations/page.tsx` (whole `integrations/` dir)
- Delete: `plane/apps/web/core/components/integration/` (github/, slack/, single-integration-card, etc.)
- Delete: `plane/apps/web/core/services/integrations/` (github.service.ts, jira.service.ts, integration.service.ts)
- Modify: whatever still imports them (found by grep) — e.g. project settings integration card, `integration-and-import-export-banner`, constants `APP_INTEGRATIONS`, loader `IntegrationsSettingsLoader` usages.

**Interfaces:**
- Consumes: nothing. Produces: nothing — pure removal. The `integration.json` i18n namespace stays (harmless; GitHub/GitLab "Issue" strings there are external-system references, allowed by glossary).

- [ ] **Step 1: Map the blast radius**

```
cd plane && rg -ln "services/integrations|components/integration/|APP_INTEGRATIONS|SingleIntegrationCard|IntegrationService|JiraService|GithubService" apps/web packages
```
List every hit before deleting. The settings nav does NOT reference the integrations page (WORKSPACE_SETTINGS has no `integrations` entry — verified), so removal is UI-dead-code cleanup.

- [ ] **Step 2: Delete + fix imports**

Delete the three targets above; for each grep hit, remove the dead import/usage (e.g. if a project-settings page renders `IntegrationCard`, remove that section; if `APP_INTEGRATIONS` lives in `packages/constants/src/fetch-keys.ts:113`, delete the constant and its import sites). Re-run the Step 1 grep → zero hits.

- [ ] **Step 3: Typecheck**

Same gate as Task 5 Step 5 — this is the critical check for removals. Expected: clean compile.

- [ ] **Step 4: Commit**

```bash
cd plane && git add -A apps/web packages && git commit -m "chore(web): remove dead Slack/GitHub/Jira integration UI (endpoints never existed in this fork)"
```

---

### Task 9: Live suite verification + status docs

**Files:**
- Modify: `ConqrHub docs` — append outcome notes to `docs/superpowers/specs/2026-07-19-suite-terminology-and-parity-design.md` is NOT needed; instead update memory + a short `ConqrTasks/…` root status file if the session owner keeps one.

- [ ] **Step 1: Hub full gate**

`cd ConqrHub && pnpm run build && cd apps/server && pnpm run test` → green.

- [ ] **Step 2: Hub live check (containerized deploy)**

Rebuild/deploy per memory gotchas (client-only changes: `pnpm run client:build` → `docker cp` dist → `chown -R 1000:1000` → NO restart; server changes need image rebuild). Browser-verify: app switcher shows "ConqrTasks" tile; AI chat still loads; if Plane integration env is configured in the container, ask the assistant "list ConqrTasks projects" and confirm a tool call fires (or check `POST /mcp` `tools/list` includes `list_conqrtasks_projects`).

- [ ] **Step 3: Plane live check**

Rebuild `conqr/plane-web:local` + backend image per `plane/deployments/cli/community/docker-compose.override.yml`, redeploy `-p plane`. Browser-verify: editor AI menu opens with the new items; ask flow posts and renders a 400-toast when LLM unconfigured (or real response if configured); Settings shows "Agents & MCP"; integrations dead page is gone; sidebar labels say "Project Notes"/"ConqrTasks" where changed.

- [ ] **Step 4: Wrap up**

Update auto-memory (`conqrhub-plane-design-application.md` or a new memory) with what shipped and any new deploy gotchas. Final commits already made per task.
