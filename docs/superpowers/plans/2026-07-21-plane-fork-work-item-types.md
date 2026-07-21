# ConqrPlane Fork: Work-Item Types Activation (Phase A: A5 part 1 / Plan 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the dormant work-item type system in the Plane CE fork: per-project type management (create/edit/activate/default), a type picker in the create modal and peek view, and correct type validation on both API surfaces. (Custom properties are Plan 3b.)

**Architecture:** The DB scaffold already exists (`IssueType`, `ProjectIssueType`, `Issue.type` FK, migrations 0070/0074) and the web side has `TIssue.type_id` plus a fully-typed but no-op modal provider. This plan builds the missing app-layer API from the worklog/estimate exemplars, a settings CRUD page from the labels exemplar, and lights up the prepared web seams. No new migration is needed except property-less tweaks — verify with makemigrations (expect **no changes** or a trivial 0124).

**Tech Stack & Harness:** identical to the previous fork plan — Django/DRF + pytest contract tests, React web + MobX/RHF, all verification via the Docker commands in `plane/conqr-verify.md` (pytest needs AMQP_URL+REDIS_URL; web typecheck via native-fs copy container, named-container + `docker wait` fallback because background bash gets reaped). Repo `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane`, branch `conqr/integration`.

## Global Constraints

- **Parallel/foreign dirty files — never stage:** `apps/web/core/lib/wrappers/store-wrapper.tsx`, `packages/propel/src/icons/brand/plane-lockup.tsx`, `plane-logo.tsx`. Never `git add -A`.
- **Terminology:** "work item type" in user-facing strings (never "issue type"); en keys only until the i18n task.
- **Epics are OUT of scope**: `is_epic` types are excluded from the picker and the settings list shows them read-only-hidden (filter `is_epic=False` everywhere user-facing). The epic-modal stub stays untouched.
- **Semantics locked by this plan:**
  - Types are workspace-level rows (`IssueType`) attached to projects via `ProjectIssueType`; our CRUD operates through project-scoped endpoints and creates/attaches in one step.
  - Exactly one default type per project (`ProjectIssueType.is_default`); enabling the feature seeds a "Task" default type when the project has none.
  - `Issue.type` may only reference a type attached to that project (validate on BOTH API surfaces).
  - Deleting a type from a project = soft-delete the `ProjectIssueType` link; the `IssueType` row is soft-deleted only when no live links remain; work items keep their `type` FK (SET_NULL only on hard delete).
  - Types CRUD requires project ADMIN (`ProjectBasePermission`-admin or `allow_permission([ROLE.ADMIN])`); reads for any member.
- Commit per task; stage only the task's files.

---

### Task 1: App-layer types API (serializers, viewset, enable endpoint, urls)

**Files:**
- Modify: `apps/api/plane/db/models/__init__.py` (add `ProjectIssueType` to the issue_type import)
- Create: `apps/api/plane/app/serializers/issue_type.py` + register in serializers `__init__.py`
- Create: `apps/api/plane/app/views/issue_type/base.py` (+ empty `__init__.py`) + register in views `__init__.py`
- Create: `apps/api/plane/app/urls/issue_type.py` + import/splat in urls `__init__.py`
- Create: `apps/api/plane/tests/contract/api/test_issue_types.py`

**Interfaces (produced — consumed by Tasks 3–5):**
```
GET    /api/workspaces/<slug>/projects/<project_id>/issue-types/            → [{id, name, description, logo_props, is_default, is_active, is_epic, level}]
POST   /api/workspaces/<slug>/projects/<project_id>/issue-types/            {name, description?, logo_props?, is_default?} → 201 (creates IssueType + ProjectIssueType link)
PATCH  /api/workspaces/<slug>/projects/<project_id>/issue-types/<pk>/       partial update incl. is_default (setting true clears the previous default) and is_active
DELETE /api/workspaces/<slug>/projects/<project_id>/issue-types/<pk>/       → 204 (soft-delete link; soft-delete type when orphaned; 400 if it is the default and other types exist... see rules below)
POST   /api/workspaces/<slug>/projects/<project_id>/issue-types/enable/     → {enabled: true, default_type: {...}} (sets project.is_issue_type_enabled=True; seeds "Task" default when project has no live non-epic types)
POST   /api/workspaces/<slug>/projects/<project_id>/issue-types/disable/    → {enabled: false} (flag off; types/links untouched)
```
`is_default` in list/detail responses is the PROJECT-level default (from the ProjectIssueType link), not `IssueType.is_default`.
Deletion rule: deleting the current default is a 400 ("set another default first") unless it is the only type.

- [ ] **Step 1: Contract tests first.** Write `test_issue_types.py` following `test_project_updates.py`'s fixture/client conventions (session_client, admin/member/guest project members). Cases (all fully written, real fixtures):
  1. `test_enable_seeds_default_task_type` — POST enable → 200, project flag true (re-fetch project via API), list shows one type named "Task" with `is_default=True`.
  2. `test_enable_is_idempotent` — second enable → still exactly one "Task" type.
  3. `test_admin_can_create_type` — POST {name: "Bug"} → 201; list has 2; "Bug" not default.
  4. `test_member_cannot_create_type` — plain MEMBER → 403 (admin-only writes).
  5. `test_set_default_moves_default` — PATCH Bug is_default=true → Task's is_default false in list.
  6. `test_delete_default_with_others_400` — DELETE current default while another exists → 400.
  7. `test_delete_nondefault_type` — → 204; list shrinks; the IssueType row is soft-deleted when not linked elsewhere (assert via ORM: `IssueType.all_objects`/`deleted_at` per the soft-delete manager conventions — copy how other tests assert soft-deletion, or assert it no longer appears in list and creating a work item with its id now 400s).
  8. `test_work_item_type_must_belong_to_project` — create a type in a DIFFERENT project, then POST an issue (app-layer issue create endpoint, same client) with `type_id` of the foreign type → 400.
  9. `test_issue_gets_default_type_when_enabled` — with feature enabled and Task default, POST an issue without type → response/DB has Task type. (Check how the app-layer issue create serializer works first — see Step 3 note.)
Run via the conqr-verify pytest command → all FAIL (404s).

- [ ] **Step 2: Serializer.**

```python
# apps/api/plane/app/serializers/issue_type.py
from rest_framework import serializers

from .base import BaseSerializer
from plane.db.models import IssueType


class IssueTypeSerializer(BaseSerializer):
    # Project-level default comes from the ProjectIssueType link; the view
    # annotates the queryset with `project_is_default`.
    is_default = serializers.BooleanField(read_only=True, source="project_is_default")

    class Meta:
        model = IssueType
        fields = [
            "id", "name", "description", "logo_props", "is_epic",
            "is_active", "level", "is_default", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_epic", "created_at", "updated_at"]
```

- [ ] **Step 3: Viewset + enable/disable endpoints.** Model on `apps/api/plane/app/views/project_update/base.py`'s stack. Key implementation notes (write real code, these are the requirements):
  - `get_queryset()`: `IssueType.objects.filter(project_issue_types__project_id=..., project_issue_types__deleted_at__isnull=True, workspace__slug=..., is_epic=False)` + `.annotate(project_is_default=F("project_issue_types__is_default"))` filtered to this project's link (use a `Subquery`/`FilteredRelation` if the naive annotate double-joins — verify against the ORM by running the tests) + membership filter like the exemplars.
  - `create`: admin-gated (`@allow_permission([ROLE.ADMIN])`); create `IssueType(workspace=project.workspace, name=..., ...)` + `ProjectIssueType(project_id=..., issue_type=..., is_default=requested or False)`; if `is_default`, clear other links' defaults first. Return the serialized type with `is_default`.
  - `partial_update`: name/description/logo_props/is_active on the IssueType; `is_default=true` flips the project link defaults atomically (`transaction.atomic`).
  - `destroy`: rules from the constraints block.
  - `enable`/`disable` endpoints (a small `BaseAPIView` each or actions): enable sets `project.is_issue_type_enabled = True` + seeds `Task` default if no live non-epic linked types (idempotent); disable clears the flag.
  - **Issue-create default-type behavior (test 9):** inspect the app-layer issue create path (`apps/api/plane/app/views/issue/base.py` + its serializer) — if it doesn't auto-assign a default type, add it there mirroring the external API's fallback (issue serializer `create`: if no type and project.is_issue_type_enabled → project default). Keep the edit minimal and mirror `api/serializers/issue.py:159-166`.
  - **Type-belongs-to-project validation (test 8):** add to the app-layer issue serializer's `validate()` the same cross-check style used for labels/assignees (`api/serializers/issue.py:75-149` pattern). ALSO fix the external serializer's unscoped `type_id` (`api/serializers/issue.py:66-68`): keep the field but add a `validate()` cross-check that the type is linked to the project.

- [ ] **Step 4: URLs** (mirror `app/urls/project_update.py`): list/create, detail patch/delete, `enable/`, `disable/`. Register in `app/urls/__init__.py`.

- [ ] **Step 5: makemigrations check** (harness): expect "No changes detected"; if the annotate work required any model tweak, inspect the generated 0124 carefully and include it.

- [ ] **Step 6: Tests green** (9/9) + regression re-run of `test_project_updates.py` and `test_issues.py` (touched the issue serializer): all pass.

- [ ] **Step 7: Commit:** `feat(work-item-types): app-layer types API — CRUD, enable/seed, project-scoped validation (A5a)`

---

### Task 2: Web store/service/hook triplet

**Files:**
- Create: `apps/web/core/services/issue/issue_type.service.ts`
- Create: `apps/web/core/store/issue-type.store.ts`
- Create: `apps/web/core/hooks/store/use-issue-type.ts` (+ export from the hooks index if one exists — mirror `use-label.ts` registration)
- Modify: `apps/web/core/store/root.store.ts` (register store — mirror how `label` store is registered)

**Interfaces (produced):**
```typescript
export type TIssueType = {
  id: string; name: string; description: string;
  logo_props: Record<string, unknown> | null;
  is_active: boolean; is_default: boolean; is_epic: boolean; level: number;
};
// IssueTypeService: list/create/update/remove/enable/disable — exact endpoints from Task 1
// IIssueTypeStore: typesFetched, projectIssueTypes(projectId), getTypeById(id),
//   defaultTypeId(projectId), fetchProjectTypes(ws, projectId), createType, updateType,
//   removeType, enableTypes(ws, projectId), disableTypes(ws, projectId)
```

Mirror `label.store.ts`/`use-label.ts`/`issue_label.service.ts` structurally (MobX observable map keyed by projectId, computedFn getters, runInAction updates). Typecheck via harness → exit 0. Commit: `feat(work-item-types): web store/service for project work-item types (A5a)`

---

### Task 3: Settings → Work item types page + feature wiring

**Files:**
- Create: `apps/web/app/(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]/work-item-types/page.tsx` + `header.tsx` (mirror the `labels/` siblings)
- Modify: `apps/web/app/routes/extended.ts` — register the settings route the same way conqr-docs/updates routes were (check whether settings child routes are in core `routes.ts` instead; follow wherever the sibling `labels` settings route is registered and add beside it — if it's a core file, the edit is additive one line)
- Create: `apps/web/core/components/issue-types/` — `types-list.tsx`, `type-item.tsx`, `create-update-type-inline.tsx`, `delete-type-modal.tsx` (mirror `components/labels/project-setting-label-*` + `AlertModalCore` delete)
- Modify: `apps/web/core/components/project/settings/features-list.tsx` — add a "Work item types" feature toggle row wired to `enableTypes/disableTypes` (inspect the file: rows are declarative with `isEnabled`; add ours reading `project.is_issue_type_enabled`, calling the store on toggle; follow the row shape exactly)
- Modify: settings sidebar registration — find where the `labels` settings nav item is declared (`packages/constants/src/settings/project.ts` per prior research: `PROJECT_SETTINGS_CATEGORIES`/`GROUPED_PROJECT_SETTINGS` + label maps) and add `work-item-types` beside it (+ icon in `item-icon.tsx` if the registry needs one)
- Modify: en i18n namespace file(s) used by sibling settings pages — keys under `work_item_types.*` (title, add_type, name_placeholder, description_placeholder, set_default, default_badge, deactivate, activate, delete_confirm, delete_confirm_detail, cannot_delete_default, enable_feature_title, enable_feature_description, empty_state)

Behavior: page lists non-epic types (icon/emoji via `logo_props` if trivially renderable — else a colored initial), badge on the default, inline create/edit, kebab menu (set default / activate-deactivate / delete with AlertModalCore). When `!project.is_issue_type_enabled`, show an enable empty-state with an Enable button (calls enable endpoint → refetch project + types). Admin-only mutations (same `allowPermissions` gating as the labels page).

Typecheck exit 0. Commit: `feat(work-item-types): project settings page + feature toggle (A5a)`

---

### Task 4: Type picker in create modal + peek

**Files:**
- Create: `apps/web/core/components/dropdowns/issue-type.tsx` (a dropdown mirroring `dropdowns/state/dropdown.tsx`'s shape: button shows current type name/icon, popover lists active non-epic project types)
- Modify: `apps/web/core/components/issues/issue-modal/components/default-properties.tsx` — add a `<Controller name="type_id">` rendering the new dropdown, FIRST in the row, only when the selected project has `is_issue_type_enabled` (read project from the project store like siblings do)
- Modify: `apps/web/core/components/issues/issue-modal/provider.tsx` — replace two no-op stubs with real implementations, leaving the rest untouched:
  - `getIssueTypeIdOnProjectChange(projectId)`: return the project's default type id from the Task 2 store (null when feature disabled) — the form already calls this on project switch (form.tsx:200-208).
  - `handleProjectEntitiesFetch`: also fetch project types (keep whatever it already does).
- Modify: `apps/web/core/components/issues/issue-type-switcher.tsx` — turn the pass-through into a real switcher: when the issue's project has the feature enabled, render the same dropdown wired to `issueOperations.update(..., {type_id})`; otherwise keep rendering `IssueIdentifier` as today. Inspect its call sites first (peek `issue-detail.tsx:95` and any others) to keep props compatible.
- en i18n keys for the dropdown (placeholder "Work item type", "No type").

Constraints: the dropdown must degrade to nothing when the feature is disabled (no layout shift for existing users); `DEFAULT_WORK_ITEM_FORM_VALUES.type_id` already exists (null) — do not change the constant.

Typecheck exit 0. Commit: `feat(work-item-types): type picker in create modal + peek switcher (A5a)`

---

### Task 5: De-upsell + external API test + docs note

**Files:**
- Modify: `apps/web/core/components/workspace/billing/comparison/plans.tsx` — rows at ~205 ("Work item Types") and ~261 ("Epics"): mark the types row as available on this deployment (match however F-ledger de-upsell edits were done before — check git log for the dead-integrations removal commit 4e61193's approach; minimal cell edits, no layout surgery). Leave Epics row untouched (still not shipped).
- Extend: `apps/api/plane/tests/contract/api/test_issue_types.py` — one external-API case: `/api/v1/` work-item create with a foreign-project `type_id` → 400 (validates the Task 1 external-serializer fix); and with a valid project type → 201 echoing `type_id`.
- Modify: `plane/conqr-verify.md` — append one line noting `test_issue_types.py` joins the covering set.

Pytest green (11 total in the file). Commit: `feat(work-item-types): external type validation test + billing de-upsell (A5a)`

---

### Task 6: i18n translation pass (18 locales)

Same workflow as the previous plan's Task 9 (`.claude/skills/translate/SKILL.md`): translate every new `work_item_types.*` + dropdown key into all 18 locales, glossary intact, ICU where used; `generate:types` + `sync:check` → 0 missing/stale/collisions (module-scoped; the pre-existing `agents_mcp.title` gap is not ours). Commit: `i18n: work-item types translations`

---

### Task 7: Ledger F12, full verify, deploy, live smoke, final review

1. Ledger row **F12** in `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\ConqrHub-Plane-Fork-Upgrade-Ledger.md` (area "Work items", divergence Medium, commits list).
2. Full backend contract suite vs the recorded baseline (~43-45 pre-existing failures) → zero NEW failures; web typecheck + lint in-container.
3. Rebuild `conqr/plane-backend:local` + `conqr/plane-web:local`, `docker compose -p plane up -d` (migrator runs), then browser smoke: enable types on the demo project via settings → "Task" seeded → create "Bug" type → set default → new work item shows type picker defaulting to Bug → change type in peek. Screenshots.
4. Final whole-branch review (most capable model) with the carried-findings list from per-task reviews; fix wave if needed.

---

## Self-review notes
- The plan deliberately touches the app-layer issue serializer (default-type + validation) — the riskiest edit; Task 1's tests 8/9 pin the behavior and the regression re-run of test_issues.py guards collateral.
- Deferred to Plan 3b: custom properties (models/values/validator, modal property inputs, settings property editor). Deferred indefinitely: epics UX, custom-property columns in layouts (static IIssueDisplayProperties union).
- Settings-route registration location is uncertain (core vs extended) — Task 3 says follow the sibling `labels` route's actual registration; that's discoverable, not a placeholder.
