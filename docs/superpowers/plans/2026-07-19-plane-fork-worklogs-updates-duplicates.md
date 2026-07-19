# ConqrPlane Fork: Worklogs + Project Updates + Duplicate Warnings (Phase A: A4 + A3 + F9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native time-tracking (worklogs), project status updates with health indicators (+ AI-drafted updates via ConqrHub), and semantic duplicate warnings in the work-item create modal to the Plane CE fork.

**Architecture:** Backend features follow the estimate/issue-link stack verbatim (ProjectBaseModel → serializer → BaseViewSet → urls module → issue_activity). Frontend uses the fork's established Conqr seam patterns: SWR + `fetchHubJson` 4-state degradation for anything touching ConqrHub, `routes/extended.ts` for new routes, dual nav-registry registration. The create modal's pre-existing unused duplicate seam (`isDuplicateModalOpen`) gets its first renderer.

**Tech Stack:** Django 4.2 + DRF + Celery (apiserver), React Router + MobX/SWR + react-hook-form (web), pytest (backend), pnpm/turbo via `node:22-alpine` Docker (host node too old). Repo: `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane`, branch `conqr/integration`.

## Global Constraints

- **Repo/branch:** all work in `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane` on `conqr/integration`. Everything here is AGPL.
- **Parallel-session guard:** do NOT touch or stage `packages/editor/src/core/components/editors/document/page-renderer.tsx`, `packages/propel/src/icons/brand/plane-lockup.tsx`, `packages/propel/src/icons/brand/plane-logo.tsx` (uncommitted foreign WIP). Never `git add -A` / `git add .` — stage only your task's files.
- **Terminology (Conqr Suite Glossary):** UI says "work item" (never "issue"), "Conqr AI" for the assistant. New user-facing strings go through i18n `t()` with keys added to `packages/i18n/src/locales/en/<namespace>.json`; the consolidated translation pass is Task 10 (do NOT hand-translate the other 18 locales in earlier tasks).
- **Migrations:** `makemigrations`-generated, next number `0122_`. Generate inside the backend container (Task 0 establishes the command).
- **Backend tests:** pytest (`apps/api/pytest.ini`, settings `plane.settings.test`, markers unit/contract, `--reuse-db --nomigrations`). New endpoints get contract tests under `apps/api/plane/tests/contract/api/`.
- **Web verification:** `pnpm --filter web run check:types` inside `node:22-alpine` (Task 0 establishes the exact command); host pnpm/node MUST NOT be used for web builds.
- **Hub endpoints consumed** (already live on ConqrHub main): `POST /api/ai/work-items/similar {title, description?, limit?}` → `{items: [{workItemId, projectId, title, sequenceId, state, labels, url, score}]}` (JWT cookie; 401 when unauth, 403 when AI toggle off, empty items when no provider — ALL must degrade silently); `POST /api/integrations/insights/status-update` for AI-drafted updates. Both via `fetchHubJson` (`credentials: "include"`, unwraps `{data}` envelope, throws `ConqrHubAuthError` on 401).
- **New activity types** need a handler registered in `plane/bgtasks/issue_activities_task.py` or the `.delay()` call records nothing.
- **Fork Upgrade Ledger:** Task 10 appends rows F9 (duplicate warnings), F10 (worklogs), F11 (project updates) to `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\ConqrHub-Plane-Fork-Upgrade-Ledger.md`.
- Commit after every task, conventional messages, staging only the task's files.

---

### Task 0: Verification harness bootstrap (backend pytest + web typecheck in Docker)

**Files:**
- Create: `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane\conqr-verify.md` (records the two working commands for later tasks)

**Interfaces:**
- Produces: two verified, copy-pasteable commands — `$PYTEST_CMD` (runs backend pytest against a disposable/test DB) and `$WEBTYPES_CMD` (runs `check:types` for `web` in node:22) — every later task runs these verbatim.

- [ ] **Step 1: Establish the backend pytest command**

The deployed stack has containers `plane-plane-db-1` (postgres 15.7) and a backend image `conqr/plane-backend:local`. Try, in order, until one runs the existing suite:

```bash
# Option A: exec into the running api container with source mounted? (check: docker ps for the api/backend container name first)
docker ps --format '{{.Names}}' | grep -i -E 'api|backend|worker'
# Option B (preferred, hermetic): one-off container on the plane compose network with the repo mounted
MSYS_NO_PATHCONV=1 docker run --rm \
  --network plane_default \
  -v "C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane\apps\api:/code" -w /code \
  -e DJANGO_SETTINGS_MODULE=plane.settings.test \
  -e DATABASE_URL=postgresql://plane:plane@plane-db:5432/plane \
  -e SECRET_KEY=test-secret-key \
  conqr/plane-backend:local \
  sh -c "pytest plane/tests/contract/api/test_labels.py -m contract -x -q"
```

Adjust: the real network name (`docker network ls | grep plane`), the DB credentials (read `plane/deployments/cli/community/*.env` or `docker inspect plane-plane-db-1` env), and whether the image's Python env has pytest (if missing: `pip install -r requirements/test.txt` inside the run, or build a small derived image). Also check `apps/api/plane/settings/test.py` for what env it demands (e.g. `SECRET_KEY`, redis) and satisfy it (redis available as `plane-redis` on the same network if needed).

- [ ] **Step 2: Run one existing contract test suite to green**

Run the chosen command with `plane/tests/contract/api/test_labels.py`. Expected: PASS (this proves harness works against a suite that predates our changes). If the image lacks test deps and cannot be satisfied in-container, STOP and report BLOCKED with exactly what's missing.

- [ ] **Step 3: Establish the web typecheck command**

```bash
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "C:\Users\admen\Documents\Claude\Projects\ConqrTasks\plane:/repo" -w /repo \
  node:22-alpine \
  sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm --filter web run check:types"
```

Expected: completes with exit 0 (cold install is slow — allow 10+ min; subsequent tasks reuse the pnpm store if you add `-v plane-pnpm-store:/root/.local/share/pnpm/store` — do add this named volume so later tasks are fast).

- [ ] **Step 4: Record both commands**

Write `conqr-verify.md` at the plane repo root containing both final working commands verbatim plus any discovered env values (mask passwords), so every later task copies them. Do NOT commit `.env` secrets into it.

- [ ] **Step 5: Commit**

```bash
git add conqr-verify.md
git commit -m "chore(conqr): document backend pytest + web typecheck harness commands"
```

---

### Task 1: Worklog backend — model + migration + serializer

**Files:**
- Create: `apps/api/plane/db/models/worklog.py`
- Modify: `apps/api/plane/db/models/__init__.py` (add export)
- Create (generated): `apps/api/plane/db/migrations/0122_issueworklog.py`
- Modify: `apps/api/plane/app/serializers/__init__.py` (add export)
- Create: `apps/api/plane/app/serializers/worklog.py`

**Interfaces:**
- Produces: `IssueWorklog` model — fields `issue (FK db.Issue, related_name="worklogs")`, `description (TextField blank)`, `duration (PositiveIntegerField, minutes)`, `logged_at (DateField, default=date.today)` plus everything ProjectBaseModel/BaseModel supplies (`project`, `workspace`, `created_by` = the logger, timestamps, soft delete). `WorklogSerializer` with `read_only_fields = ["workspace", "project", "issue", "created_by"]`.

- [ ] **Step 1: Write the model**

```python
# apps/api/plane/db/models/worklog.py
from datetime import date

from django.db import models

from .project import ProjectBaseModel


class IssueWorklog(ProjectBaseModel):
    """Time logged against a work item (gap-analysis A4, Plane §10.3)."""

    issue = models.ForeignKey(
        "db.Issue", on_delete=models.CASCADE, related_name="worklogs"
    )
    description = models.TextField(blank=True)
    # Duration in minutes — integers keep aggregation exact.
    duration = models.PositiveIntegerField(default=0)
    logged_at = models.DateField(default=date.today)

    class Meta:
        verbose_name = "Issue Worklog"
        verbose_name_plural = "Issue Worklogs"
        db_table = "issue_worklogs"
        ordering = ("-logged_at", "-created_at")

    def __str__(self):
        return f"{self.duration}m on {self.issue_id} by {self.created_by_id}"
```

- [ ] **Step 2: Export the model**

In `apps/api/plane/db/models/__init__.py`, add (alphabetically near the other issue imports):

```python
from .worklog import IssueWorklog
```

- [ ] **Step 3: Generate the migration inside the backend container**

Using the Task 0 harness pattern (same mounts/env, but `DJANGO_SETTINGS_MODULE` left as the image default or `plane.settings.test`):

```bash
MSYS_NO_PATHCONV=1 docker run --rm <same mounts/env as PYTEST_CMD> conqr/plane-backend:local \
  sh -c "python manage.py makemigrations db"
```

Expected: creates `apps/api/plane/db/migrations/0122_issueworklog.py` (name may vary slightly — accept what makemigrations produces). Inspect it: one `CreateModel` for `IssueWorklog` with the fields above.

- [ ] **Step 4: Write the serializer**

```python
# apps/api/plane/app/serializers/worklog.py
from .base import BaseSerializer
from plane.db.models import IssueWorklog


class WorklogSerializer(BaseSerializer):
    class Meta:
        model = IssueWorklog
        fields = "__all__"
        read_only_fields = [
            "workspace",
            "project",
            "issue",
            "created_by",
            "updated_by",
        ]
```

Register in `apps/api/plane/app/serializers/__init__.py`:

```python
from .worklog import WorklogSerializer
```

- [ ] **Step 5: Verify migration applies + typecheck by import**

Run (Task 0 harness): `sh -c "python manage.py migrate db && python -c 'from plane.db.models import IssueWorklog; from plane.app.serializers import WorklogSerializer; print(\"ok\")'"`
Expected: migration applies to the dev DB, prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/plane/db/models/worklog.py apps/api/plane/db/models/__init__.py apps/api/plane/db/migrations/0122_*.py apps/api/plane/app/serializers/worklog.py apps/api/plane/app/serializers/__init__.py
git commit -m "feat(worklogs): IssueWorklog model + serializer (A4)"
```

---

### Task 2: Worklog backend — views, urls, activity handler, contract tests

**Files:**
- Create: `apps/api/plane/app/views/worklog/base.py` (+ empty `__init__.py`)
- Modify: `apps/api/plane/app/views/__init__.py` (export views)
- Create: `apps/api/plane/app/urls/worklog.py`
- Modify: `apps/api/plane/app/urls/__init__.py` (import + splat)
- Modify: `apps/api/plane/bgtasks/issue_activities_task.py` (register worklog activity handlers)
- Create: `apps/api/plane/tests/contract/api/test_worklogs.py`

**Interfaces:**
- Consumes: `IssueWorklog`, `WorklogSerializer` (Task 1); `issue_activity.delay` signature per the issue-link exemplar (`apps/api/plane/app/views/issue/link.py:53`).
- Produces endpoints (consumed by Task 3's frontend service):
  - `GET/POST  /api/workspaces/<slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/`
  - `PATCH/DELETE /api/workspaces/<slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/`
  - `GET /api/workspaces/<slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/total/` → `{"total_minutes": int}`
- Rules: create requires ADMIN or MEMBER; update/delete allowed to the worklog's creator or a project ADMIN; list visible to any project member.

- [ ] **Step 1: Write the contract tests first**

Open `apps/api/plane/tests/contract/api/test_labels.py` and `apps/api/plane/tests/factories.py` to copy the fixture/client conventions exactly (how a workspace/project/issue/member is factory-built and how an authenticated client is obtained). Then write `test_worklogs.py` with these cases (adapt fixture names to the real factories — behavior below is binding):

```python
# apps/api/plane/tests/contract/api/test_worklogs.py
import pytest

pytestmark = pytest.mark.contract


class TestWorklogs:
    def test_member_can_log_time(self, ...):
        # POST .../issues/<id>/worklogs/ {"duration": 90, "description": "review"}
        # → 201, response has id, duration=90, created_by == the caller

    def test_list_returns_issue_worklogs(self, ...):
        # two worklogs on issue A, one on issue B → GET issue A list returns exactly 2

    def test_total_endpoint_sums_minutes(self, ...):
        # worklogs 90 + 30 → GET .../worklogs/total/ → {"total_minutes": 120}

    def test_creator_can_update_own_worklog(self, ...):
        # PATCH duration 90→60 by creator → 200, duration 60

    def test_non_creator_member_cannot_update(self, ...):
        # PATCH by a different plain member → 403

    def test_admin_can_delete_any_worklog(self, ...):
        # DELETE by project admin (not creator) → 204; list shrinks

    def test_guest_cannot_create(self, ...):
        # POST by guest-role member → 403
```

Every `...` body must be fully written using the repo's actual factories/clients — no test may be left as a stub.

- [ ] **Step 2: Run tests to verify they fail**

Task 0 harness: `pytest plane/tests/contract/api/test_worklogs.py -m contract -q`
Expected: FAIL — 404s (routes don't exist).

- [ ] **Step 3: Implement the viewset**

```python
# apps/api/plane/app/views/worklog/base.py
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ProjectEntityPermission, allow_permission, ROLE
from plane.app.serializers import WorklogSerializer
from plane.db.models import IssueWorklog, ProjectMember
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.host import base_host
from ..base import BaseViewSet, BaseAPIView


class IssueWorklogViewSet(BaseViewSet):
    serializer_class = WorklogSerializer
    model = IssueWorklog
    permission_classes = [ProjectEntityPermission]

    def get_queryset(self):
        return (
            IssueWorklog.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
                issue_id=self.kwargs.get("issue_id"),
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("created_by")
            .distinct()
        )

    def _can_modify(self, request, instance):
        if instance.created_by_id == request.user.id:
            return True
        return ProjectMember.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
            member=request.user,
            role=ROLE.ADMIN.value,
            is_active=True,
        ).exists()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        serializer = WorklogSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(project_id=project_id, issue_id=issue_id)
        issue_activity.delay(
            type="worklog.activity.created",
            requested_data=json.dumps(serializer.data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, project_id, issue_id, pk):
        worklog = self.get_queryset().get(pk=pk)
        if not self._can_modify(request, worklog):
            return Response(
                {"error": "Only the worklog creator or a project admin can edit it"},
                status=status.HTTP_403_FORBIDDEN,
            )
        current = json.dumps(WorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        serializer = WorklogSerializer(worklog, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        issue_activity.delay(
            type="worklog.activity.updated",
            requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, project_id, issue_id, pk):
        worklog = self.get_queryset().get(pk=pk)
        if not self._can_modify(request, worklog):
            return Response(
                {"error": "Only the worklog creator or a project admin can delete it"},
                status=status.HTTP_403_FORBIDDEN,
            )
        current = json.dumps(WorklogSerializer(worklog).data, cls=DjangoJSONEncoder)
        worklog.delete()
        issue_activity.delay(
            type="worklog.activity.deleted",
            requested_data=None,
            actor_id=str(request.user.id),
            issue_id=str(issue_id),
            project_id=str(project_id),
            current_instance=current,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssueWorklogTotalEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, issue_id):
        total = (
            IssueWorklog.objects.filter(
                workspace__slug=slug, project_id=project_id, issue_id=issue_id
            ).aggregate(total=Sum("duration"))["total"]
            or 0
        )
        return Response({"total_minutes": total}, status=status.HTTP_200_OK)
```

Adjust imports to reality: verify `ProjectMember` import path (`plane.db.models`), `ROLE` enum value attribute (open `permissions/base.py` — if `ROLE.ADMIN` is already an int use it directly), and `base_host` util path (grep `from plane.utils.host import base_host` in `link.py` and copy exactly). Create `apps/api/plane/app/views/worklog/__init__.py` (empty) and export both classes from `apps/api/plane/app/views/__init__.py`.

- [ ] **Step 4: URLs**

```python
# apps/api/plane/app/urls/worklog.py
from django.urls import path

from plane.app.views import IssueWorklogViewSet, IssueWorklogTotalEndpoint

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/",
        IssueWorklogViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-worklogs",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/<uuid:pk>/",
        IssueWorklogViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-worklog-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/worklogs/total/",
        IssueWorklogTotalEndpoint.as_view(),
        name="issue-worklog-total",
    ),
]
```

NOTE: register the `total/` path BEFORE the `<uuid:pk>/` path in the list (Django matches in order; `total` is not a UUID so ordering is technically safe either way, but keep total first for clarity). In `apps/api/plane/app/urls/__init__.py` add `from .worklog import urlpatterns as worklog_urls` and splat `*worklog_urls` alongside the others.

- [ ] **Step 5: Activity handler**

Open `apps/api/plane/bgtasks/issue_activities_task.py`, find the dispatch mapping (grep `link.activity.created` — there is a dict mapping type → handler function). Add worklog handlers mirroring the link ones (`create_link_activity` etc.): `create_worklog_activity`, `update_worklog_activity`, `delete_worklog_activity`, producing `IssueActivity(verb="created"|"updated"|"deleted", field="worklog", comment=f"logged time"...)` rows consistent with how link handlers construct theirs (copy a link handler, adjust field name and comment strings, read `duration` from the requested data). Register the three types in the mapping.

- [ ] **Step 6: Run contract tests to green**

Task 0 harness: `pytest plane/tests/contract/api/test_worklogs.py -m contract -q`
Expected: 7/7 PASS. Also run the neighboring `test_labels.py` once to prove no collateral: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/plane/app/views/worklog/ apps/api/plane/app/views/__init__.py apps/api/plane/app/urls/worklog.py apps/api/plane/app/urls/__init__.py apps/api/plane/bgtasks/issue_activities_task.py apps/api/plane/tests/contract/api/test_worklogs.py
git commit -m "feat(worklogs): CRUD + total endpoints, activity tracking, contract tests (A4)"
```

---

### Task 3: Worklog external REST API parity

**Files:**
- Modify: `apps/api/plane/api/serializers/__init__.py` + Create `apps/api/plane/api/serializers/worklog.py`
- Modify: `apps/api/plane/api/views/__init__.py` + Create `apps/api/plane/api/views/worklog.py`
- Modify: `apps/api/plane/api/urls/work_item.py` (add worklog paths)
- Modify (extend): `apps/api/plane/tests/contract/api/test_worklogs.py` (external-API cases)

**Interfaces:**
- Consumes: `IssueWorklog` model.
- Produces (doc §10.3 API parity — create/list/total/update/delete with `X-Api-Key`):
  - `GET/POST /api/v1/workspaces/<slug>/projects/<project_id>/work-items/<issue_id>/worklogs/`
  - `PATCH/DELETE .../work-items/<issue_id>/worklogs/<pk>/`
  - `GET .../work-items/<issue_id>/worklogs/total/`

- [ ] **Step 1: Read the exemplar once**

Open `apps/api/plane/api/views/issue.py` classes `IssueLinkListCreateAPIEndpoint` / `IssueLinkDetailAPIEndpoint` and `apps/api/plane/api/serializers/issue.py`'s link serializers. Mirror them exactly for worklogs: `WorklogAPISerializer` (fields `id, duration, description, logged_at, issue, project, workspace, created_by, created_at, updated_at`, read-only tenancy fields), `WorklogListCreateAPIEndpoint`, `WorklogDetailAPIEndpoint`, `WorklogTotalAPIEndpoint` with `permission_classes = [ProjectEntityPermission]`, `use_read_replica = True` on reads, pagination on list via `self.paginate(...)` if the link list paginates (copy). Skip drf-spectacular decorator docs if the link ones require extra doc modules — match whatever compiles cleanly; if `@extend_schema` is trivial to mirror, include it.

- [ ] **Step 2: Extend contract tests (external surface)**

Add to `test_worklogs.py`: `test_external_api_create_and_list` and `test_external_api_total` using the same api-key client fixture the other external contract tests use (grep `X-Api-Key` or `api_key` in `plane/tests/contract/api/` for the fixture name; follow `test_issues.py`'s pattern for `/api/v1/` calls). Run → FAIL (404).

- [ ] **Step 3: Implement + register urls**

Add paths in `apps/api/plane/api/urls/work_item.py` under the existing work-items prefix (mirror the links block, both `work-items` and legacy `issues` aliases if links have both).

- [ ] **Step 4: Run to green**

`pytest plane/tests/contract/api/test_worklogs.py -m contract -q` → all PASS (7 app + 2 external).

- [ ] **Step 5: Commit**

```bash
git add apps/api/plane/api/serializers/worklog.py apps/api/plane/api/serializers/__init__.py apps/api/plane/api/views/worklog.py apps/api/plane/api/views/__init__.py apps/api/plane/api/urls/work_item.py apps/api/plane/tests/contract/api/test_worklogs.py
git commit -m "feat(worklogs): external REST API parity endpoints (A4)"
```

---

### Task 4: Worklog frontend — service + peek-sidebar UI

**Files:**
- Create: `apps/web/core/services/issue/issue_worklog.service.ts`
- Create: `apps/web/core/components/issues/issue-detail/worklog/root.tsx`
- Create: `apps/web/core/components/issues/issue-detail/worklog/worklog-item.tsx`
- Create: `apps/web/core/components/issues/issue-detail/worklog/log-time-form.tsx`
- Modify: `apps/web/core/components/issues/issue-detail/sidebar.tsx` (mount the section)
- Modify: `packages/i18n/src/locales/en/issue.json` (or the namespace the sidebar's existing keys live in — inspect `sidebar.tsx`'s `t()` keys and use the same file; en only, Task 10 translates)

**Interfaces:**
- Consumes: Task 2 endpoints. SWR precedent from `apps/web/core/components/conqr/project-docs-root.tsx` (this feature is native, not Hub-gated — no `CONQR_HUB_URL` gate, plain `useSWR` against our own API).
- Produces: `WorklogService` with `list(workspaceSlug, projectId, issueId): Promise<TWorklog[]>`, `create(..., data: {duration: number; description?: string; logged_at?: string})`, `update(..., worklogId, data)`, `remove(..., worklogId)`, `total(...): Promise<{total_minutes: number}>`; `TWorklog = {id: string; duration: number; description: string; logged_at: string; created_by: string; created_at: string}`.

- [ ] **Step 1: Service**

```typescript
// apps/web/core/services/issue/issue_worklog.service.ts
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TWorklog = {
  id: string;
  duration: number; // minutes
  description: string;
  logged_at: string;
  created_by: string;
  created_at: string;
};

export class IssueWorklogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(workspaceSlug: string, projectId: string, issueId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/worklogs/`;
  }

  async list(workspaceSlug: string, projectId: string, issueId: string): Promise<TWorklog[]> {
    return this.get(this.base(workspaceSlug, projectId, issueId))
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: { duration: number; description?: string; logged_at?: string }
  ): Promise<TWorklog> {
    return this.post(this.base(workspaceSlug, projectId, issueId), data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    worklogId: string,
    data: Partial<{ duration: number; description: string; logged_at: string }>
  ): Promise<TWorklog> {
    return this.patch(`${this.base(workspaceSlug, projectId, issueId)}${worklogId}/`, data)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async remove(workspaceSlug: string, projectId: string, issueId: string, worklogId: string): Promise<void> {
    return this.delete(`${this.base(workspaceSlug, projectId, issueId)}${worklogId}/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async total(workspaceSlug: string, projectId: string, issueId: string): Promise<{ total_minutes: number }> {
    return this.get(`${this.base(workspaceSlug, projectId, issueId)}total/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}

export const issueWorklogService = new IssueWorklogService();
```

Check the actual `APIService` import path by copying the top of `issue_comment.service.ts` — adjust if it differs.

- [ ] **Step 2: UI components**

`root.tsx` — an observer-free functional component `<WorklogRoot workspaceSlug projectId issueId disabled />`:
- `useSWR(["worklogs", issueId], () => issueWorklogService.list(...))` and a parallel total fetch (or compute total client-side from the list — DO compute client-side, one request less; drop the total call here).
- Header row: clock icon + `t("worklog.title")` ("Time tracked") + formatted total (`90` → `1h 30m`; write a tiny `formatMinutes(minutes)` helper in the same file) + a "+" button (hidden when `disabled`).
- "+" opens `<LogTimeForm>` inline (local state): two numeric inputs (hours/minutes, either may be empty), a description text input, submit → `issueWorklogService.create` with `duration = h*60+m` (reject 0 with a small error), then `mutate()` the SWR key.
- List of `<WorklogItem>`: formatted duration, description, date, author avatar if a member-lookup hook is trivially available (`useMember` — check how `sidebar.tsx` renders assignee avatars and reuse; if non-trivial, show initials from `created_by` lookup or omit avatar), edit/delete menu shown when the current user is the creator or a project admin (`useUser()` for current user id; admin check — copy whatever role check `sidebar.tsx`/neighbors use, e.g. `allowPermissions`/`EUserPermissions`).
- Match the sidebar's visual language: use the same primitive components (`SidebarPropertyListItem` if it accepts children blocks, else a plain section styled like `label.tsx`'s section). Copy classNames from a neighboring section rather than inventing.

- [ ] **Step 3: Mount in sidebar**

In `apps/web/core/components/issues/issue-detail/sidebar.tsx`, after the estimate/date property rows (find the property list's end), add:

```tsx
<WorklogRoot
  workspaceSlug={workspaceSlug}
  projectId={projectId}
  issueId={issueId}
  disabled={!isEditable}
/>
```

using whatever the surrounding rows use for `workspaceSlug/projectId/issueId/isEditable` (read the file; the names exist in scope). Import at top.

- [ ] **Step 4: i18n keys (en only)**

Add to the namespace file the sidebar already uses (verify by grepping one of its existing keys), under a `worklog` object: `title` ("Time tracked"), `log_time` ("Log time"), `hours` ("Hours"), `minutes` ("Minutes"), `notes_placeholder` ("What did you work on?"), `submit` ("Log"), `empty` ("No time logged yet"), `delete_confirm` ("Delete this worklog?"), `duration_required` ("Enter a duration").

- [ ] **Step 5: Typecheck**

Task 0 web command → exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/core/services/issue/issue_worklog.service.ts apps/web/core/components/issues/issue-detail/worklog/ apps/web/core/components/issues/issue-detail/sidebar.tsx packages/i18n/src/locales/en/<namespace>.json
git commit -m "feat(worklogs): time-tracked section in work-item sidebar (A4)"
```

---

### Task 5: Project updates backend — model + endpoints + tests

**Files:**
- Create: `apps/api/plane/db/models/project_update.py`
- Modify: `apps/api/plane/db/models/__init__.py`
- Create (generated): `apps/api/plane/db/migrations/0123_projectupdate.py`
- Create: `apps/api/plane/app/serializers/project_update.py` + register in `__init__.py`
- Create: `apps/api/plane/app/views/project_update/base.py` (+ `__init__.py`) + register in views `__init__.py`
- Create: `apps/api/plane/app/urls/project_update.py` + register in urls `__init__.py`
- Create: `apps/api/plane/tests/contract/api/test_project_updates.py`

**Interfaces:**
- Produces model `ProjectUpdate(ProjectBaseModel)`: `health (TextChoices: on-track|at-risk|off-track, default on-track)`, `description (TextField)`; endpoints (consumed by Task 6):
  - `GET/POST /api/workspaces/<slug>/projects/<uuid:project_id>/updates/`
  - `PATCH/DELETE /api/workspaces/<slug>/projects/<uuid:project_id>/updates/<uuid:pk>/`
- Rules: create/update/delete ADMIN or MEMBER (author or admin for modify, same `_can_modify` pattern as worklogs); list any project member. Ordering `-created_at` (chronological feed).

- [ ] **Step 1: Model**

```python
# apps/api/plane/db/models/project_update.py
from django.db import models

from .project import ProjectBaseModel


class ProjectUpdate(ProjectBaseModel):
    """Chronological project status update with a health signal (A3, Plane §3.4)."""

    class ProjectHealth(models.TextChoices):
        ON_TRACK = "on-track", "On Track"
        AT_RISK = "at-risk", "At Risk"
        OFF_TRACK = "off-track", "Off Track"

    health = models.CharField(
        max_length=20, choices=ProjectHealth.choices, default=ProjectHealth.ON_TRACK
    )
    description = models.TextField(blank=True)

    class Meta:
        verbose_name = "Project Update"
        verbose_name_plural = "Project Updates"
        db_table = "project_updates"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.project_id} {self.health} @ {self.created_at:%Y-%m-%d}"
```

- [ ] **Step 2: Serializer, viewset, urls — mirror Task 2's stack exactly** (same `_can_modify`, same permission classes, no issue_activity — project updates are not issue-scoped; no activity task call). Viewset methods `list/create/partial_update/destroy`; `serializer.save(project_id=project_id)` on create. Register model/serializer/views/urls in the four `__init__.py` files. Generate migration `0123_` in the container.

- [ ] **Step 3: Contract tests first, then implement** (same rhythm as Task 2):

`test_project_updates.py` cases: member creates update with health → 201 and defaults applied; list ordered newest-first; author edits own → 200; other member edits → 403; admin deletes any → 204; guest create → 403. Write fully with real factories. RED → implement → GREEN. Also re-run `test_worklogs.py` once (shared urls `__init__` touched): PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/plane/db/models/project_update.py apps/api/plane/db/models/__init__.py apps/api/plane/db/migrations/0123_*.py apps/api/plane/app/serializers/project_update.py apps/api/plane/app/serializers/__init__.py apps/api/plane/app/views/project_update/ apps/api/plane/app/views/__init__.py apps/api/plane/app/urls/project_update.py apps/api/plane/app/urls/__init__.py apps/api/plane/tests/contract/api/test_project_updates.py
git commit -m "feat(project-updates): ProjectUpdate model + CRUD + health, contract tests (A3)"
```

---### Task 6: Project updates frontend — route, page, nav, composer

**Files:**
- Create: `apps/web/core/services/project/project_update.service.ts` (check dir: where does `project.service.ts` live — `core/services/project/`? mirror)
- Create: `apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/updates/layout.tsx`, `header.tsx`, `page.tsx` (copy the `conqr-docs/` trio's structure)
- Create: `apps/web/core/components/project/updates/root.tsx`, `update-card.tsx`, `new-update-form.tsx`, `health-badge.tsx`
- Modify: `apps/web/app/routes/extended.ts` (register route)
- Modify: `apps/web/core/components/navigation/use-navigation-items.ts` (+ item, `sortOrder` just after Docs' 5.5, e.g. 5.7; NOT config-gated — native feature, `shouldRender: true`)
- Modify: `apps/web/core/components/workspace/sidebar/project-navigation.tsx` (mirror item)
- Modify: `packages/i18n/src/locales/en/navigation.json` (nav key) + the project namespace en file (feature strings)

**Interfaces:**
- Consumes: Task 5 endpoints; `TProjectUpdate = {id: string; health: "on-track"|"at-risk"|"off-track"; description: string; created_by: string; created_at: string; updated_at: string}`.
- Produces: `/:workspaceSlug/projects/:projectId/updates` route with a chronological feed + composer.

- [ ] **Step 1: Service** — same shape as Task 4's service (list/create/update/remove) against `/api/workspaces/${ws}/projects/${p}/updates/`.

- [ ] **Step 2: Components**
- `health-badge.tsx`: maps health → label via `t()` + color chip (`on-track` green / `at-risk` amber / `off-track` red — use the repo's existing badge primitives; grep how cycle status chips are styled and copy).
- `new-update-form.tsx`: health select (3 options, custom-select primitive used elsewhere in project settings) + `<textarea>` (rows 4, placeholder `t("project_updates.placeholder")`) + submit button; calls service.create then `mutate`.
- `update-card.tsx`: health badge, author + relative date (copy the relative-time util the notification bell or comments use), description rendered as plain text with `whitespace-pre-wrap`, edit/delete menu for author/admin (same permission check pattern as Task 4).
- `root.tsx`: `useSWR` list + composer on top + feed below + empty state ("Share the first status update").

- [ ] **Step 3: Route + page trio** — copy `conqr-docs/` `layout.tsx`/`header.tsx`/`page.tsx` structure, header shows project name + "Updates" breadcrumb (mirror conqr-docs header). Register in `routes/extended.ts` exactly like the conqr-docs entry, path `":workspaceSlug/projects/:projectId/updates"`.

- [ ] **Step 4: Nav registration in BOTH registries** — key `project_updates`, i18n key added to `navigation.json` (`"project_updates": "Updates"` — nested per the file's structure), icon: pick a lucide icon consistent with neighbors (`MessagesSquare` or `Activity`), `access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST]` (guests read), `sortOrder: 5.7`, `shouldRender: true`.

- [ ] **Step 5: Typecheck (Task 0 web command) → exit 0. Manual route smoke deferred to Task 10's live verify.**

- [ ] **Step 6: Commit**

```bash
git add apps/web/core/services/project/project_update.service.ts "apps/web/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/updates/" apps/web/core/components/project/updates/ apps/web/app/routes/extended.ts apps/web/core/components/navigation/use-navigation-items.ts apps/web/core/components/workspace/sidebar/project-navigation.tsx packages/i18n/src/locales/en/navigation.json packages/i18n/src/locales/en/<project-namespace>.json
git commit -m "feat(project-updates): Updates tab — feed, composer, health badges (A3)"
```

---

### Task 7: AI-drafted project update (Hub-grounded)

**Files:**
- Modify: `apps/web/core/components/conqr/conqr-hub-client.ts` (new call + type)
- Modify: `apps/web/core/components/project/updates/new-update-form.tsx` ("Draft with Conqr AI" button)
- Modify: en i18n namespace file (keys)

**Interfaces:**
- Consumes: ConqrHub `POST /api/integrations/insights/status-update` — inspect the Hub side first: read `ConqrHub/apps/server/src/core/integration/integration.controller.ts` (the `insights/status-update` route) and `cross-product-insight.service.ts` for the exact request body (likely `{planeProjectId}` or `{projectId}`) and response shape; use the REAL names found there.
- Produces: `fetchStatusUpdateDraft(planeProjectId: string): Promise<TConqrStatusDraft>` in conqr-hub-client.

- [ ] **Step 1: Read the Hub endpoint contract** (files above, in the ConqrHub repo — read-only) and record exact body/response in your report.

- [ ] **Step 2: Add the client call** following `fetchHubJson` patterns + exported type. Gate: only meaningful when `CONQR_HUB_URL` set.

- [ ] **Step 3: Button in `new-update-form.tsx`:** visible only when `CONQR_HUB_URL` is truthy; sparkle icon + `t("project_updates.draft_with_ai")` ("Draft with Conqr AI"); on click → loading state → `fetchStatusUpdateDraft(projectId)` → on success fill the textarea with the draft text (do not auto-submit; the human reviews — this is the Build-mode principle); on `ConqrHubAuthError` → toast `t("project_updates.ai_needs_hub_login")`; on other errors → toast `t("project_updates.ai_unavailable")`; never blocks manual composing.

- [ ] **Step 4: Typecheck → exit 0. Commit:**

```bash
git add apps/web/core/components/conqr/conqr-hub-client.ts apps/web/core/components/project/updates/new-update-form.tsx packages/i18n/src/locales/en/<namespace>.json
git commit -m "feat(conqr): AI-drafted project update via Hub insights (A3/F-ledger)"
```

---

### Task 8: Duplicate warnings in the create modal (F9)

**Files:**
- Modify: `apps/web/core/components/conqr/conqr-hub-client.ts` (similar-work-items call + type)
- Create: `apps/web/core/components/conqr/use-conqr-duplicate-check.ts`
- Create: `apps/web/core/components/conqr/possible-duplicates-panel.tsx`
- Modify: `apps/web/core/components/issues/issue-modal/form.tsx` (wire the prepared seam)
- Modify: en i18n namespace file (keys)

**Interfaces:**
- Consumes: Hub `POST /api/ai/work-items/similar {title, description?, limit}` → envelope-unwrapped `{items: TConqrSimilarWorkItem[]}`; the modal's prepared seam: `isDuplicateModalOpen` state + `handleDuplicateIssueModal(v: boolean)` already threaded into `IssueFormRoot` (props exist, unused) and `base.tsx` already widens the modal when open.
- Produces: while typing a title (debounced 700ms, ≥ 12 chars), a subtle "N possible duplicates" pill appears near the title; clicking toggles a side panel listing matches with deep links. Silent on ANY failure (unconfigured/401/403/error/empty).

- [ ] **Step 1: Client call + type**

```typescript
// added to conqr-hub-client.ts
export type TConqrSimilarWorkItem = {
  workItemId: string;
  projectId: string | null;
  title: string | null;
  sequenceId: number | null;
  state: string | null;
  labels: string[];
  url: string | null;
  score: number;
};

export async function fetchSimilarWorkItems(
  title: string,
  description?: string
): Promise<TConqrSimilarWorkItem[]> {
  const res = await fetchHubJson<{ items: TConqrSimilarWorkItem[] }>("/ai/work-items/similar", {
    title,
    description,
    limit: 5,
  });
  return res?.items ?? [];
}
```

- [ ] **Step 2: Hook**

```typescript
// apps/web/core/components/conqr/use-conqr-duplicate-check.ts
import { useEffect, useRef, useState } from "react";
import { CONQR_HUB_URL, fetchSimilarWorkItems, TConqrSimilarWorkItem } from "./conqr-hub-client";

const DEBOUNCE_MS = 700;
const MIN_TITLE_LENGTH = 12;

/**
 * Debounced semantic duplicate lookup against ConqrHub (fork ledger F9).
 * Returns [] and stays silent on every failure mode: Hub unconfigured,
 * unauthenticated, AI disabled, network error, or no provider.
 */
export const useConqrDuplicateCheck = (title: string | undefined | null) => {
  const [hits, setHits] = useState<TConqrSimilarWorkItem[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!CONQR_HUB_URL) return;
    const trimmed = (title ?? "").trim();
    if (trimmed.length < MIN_TITLE_LENGTH) {
      setHits([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const seq = ++requestSeq.current;
    timer.current = setTimeout(async () => {
      setIsChecking(true);
      try {
        const items = await fetchSimilarWorkItems(trimmed);
        if (requestSeq.current === seq) setHits(items);
      } catch {
        if (requestSeq.current === seq) setHits([]);
      } finally {
        if (requestSeq.current === seq) setIsChecking(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [title]);

  return { hits, isChecking };
};
```

- [ ] **Step 3: Panel component**

`possible-duplicates-panel.tsx`: props `{hits, onClose}`. A narrow right-hand column (the modal already widens via `EModalWidth.VIXL` when `isDuplicateModalOpen`) — header `t("conqr_duplicates.title")` ("Possible duplicates") + close X; list of cards: `#{sequenceId} {title}`, state chip, labels, opening `url` in a new tab (`window.open(url, "_blank", "noopener")` or `<a target="_blank" rel="noopener noreferrer">` — use the anchor). Footer microcopy `t("conqr_duplicates.hint")` ("Found by Conqr AI semantic search"). Style with the same tailwind tokens neighboring modal components use (copy classNames from an existing side column if one exists in the codebase, else keep to `border-l border-custom-border-200 p-4 space-y-3` idiom seen across the app).

- [ ] **Step 4: Wire the seam in `form.tsx`**

- `const titleValue = watch("name");` (RHF `watch` is already in scope or destructure from `useForm` return).
- `const { hits } = useConqrDuplicateCheck(titleValue);`
- `useEffect(() => { if (hits.length === 0 && isDuplicateModalOpen) handleDuplicateIssueModal(false); }, [hits.length])` — panel never sticks around with zero hits.
- Near the title input (right side of the title row or directly under it): when `hits.length > 0 && !isDuplicateModalOpen`, render a subtle amber pill button — `t("conqr_duplicates.pill", { count: hits.length })` ("{{count}} possible duplicates") → `onClick={() => handleDuplicateIssueModal(true)}`. Check how the i18n lib does interpolation (grep `{{count}}` or `t(` with object arg in the web app; follow it).
- When `isDuplicateModalOpen`: render `<PossibleDuplicatesPanel hits={hits} onClose={() => handleDuplicateIssueModal(false)} />` as the flex sibling the widened layout expects — inspect how `base.tsx`'s width change lays out `form.tsx`'s root JSX and place the panel so form + panel sit side by side (form root likely needs `flex` wrapper with the panel as second column; keep the edit additive and minimal).
- Everything renders nothing when `CONQR_HUB_URL` is unset (`hits` stays `[]`).

- [ ] **Step 5: i18n keys (en):** `conqr_duplicates.title`, `.pill`, `.hint` in the namespace the modal uses (grep an existing `t()` key in `form.tsx` to find it).

- [ ] **Step 6: Typecheck (Task 0 command) → exit 0. Commit:**

```bash
git add apps/web/core/components/conqr/conqr-hub-client.ts apps/web/core/components/conqr/use-conqr-duplicate-check.ts apps/web/core/components/conqr/possible-duplicates-panel.tsx apps/web/core/components/issues/issue-modal/form.tsx packages/i18n/src/locales/en/<namespace>.json
git commit -m "feat(conqr): semantic duplicate warnings in work-item create modal (F9)"
```

---

### Task 9: i18n translation pass (all 18 locales)

**Files:**
- Modify: every `packages/i18n/src/locales/<locale>/<namespace>.json` touched by Tasks 4/6/7/8

- [ ] **Step 1: Invoke the repo's translate workflow** — read `.claude/skills/translate/SKILL.md` in the plane repo and follow it for every key added in Tasks 4–8: translate into all 18 non-English locales (NEVER copy English as a shortcut), keep glossary terms (Conqr AI, ConqrHub, ConqrPlane, Project Notes) untranslated.
- [ ] **Step 2: Verify:** `pnpm --filter @plane/i18n run generate:types && pnpm --filter @plane/i18n run sync:check` inside the node:22 container → `0 missing, 0 stale, 0 collisions`.
- [ ] **Step 3: Commit** (i18n files only): `git commit -m "i18n: translations for worklogs, project updates, duplicate warnings"`

---

### Task 10: Ledger, docs, full verification, live smoke

**Files:**
- Modify: `C:\Users\admen\Documents\Claude\Projects\ConqrTasks\ConqrHub-Plane-Fork-Upgrade-Ledger.md` (rows F9/F10/F11)
- No code changes — final gate.

- [ ] **Step 1: Ledger rows** — append to the ledger table following its exact column format: F9 duplicate warnings (seams: conqr/* + form.tsx additive edit, risk Low), F10 worklogs (NEW divergence: db model 0122 + app/api views/urls + activity handler + sidebar section — risk Medium, upstream may ship paid worklogs), F11 project updates (NEW divergence: db model 0123 + views/urls + route/nav — risk Medium). Status "Applied — commits <shas>".
- [ ] **Step 2: Full backend contract suite:** Task 0 harness, `pytest plane/tests/contract -m contract -q` → no regressions (pre-existing failures, if any, must match a baseline run recorded in Task 0's report).
- [ ] **Step 3: Web typecheck + lint:** `pnpm --filter web run check:types` and `check:lint` in the container → types exit 0; lint within the existing `--max-warnings` budget.
- [ ] **Step 4: Live smoke (build + deploy local images):** rebuild `conqr/plane-web:local` + `conqr/plane-backend:local` per `plane/deployments/cli/community/docker-compose.override.yml` workflow (see repo README-adjacent docs / prior ledger notes), `docker compose -p plane up -d`, run migrations, then in a browser: (a) open a work item → log 1h 30m → total shows "1h 30m", activity shows the worklog entry; (b) open Updates tab → post an update with At Risk → appears with amber badge; (c) open create modal → type a long title matching an indexed item → duplicates pill appears (requires Hub session + AI provider; if no AI key locally, verify the pill simply never appears and no console errors — that IS the degradation contract). Screenshot each. If the environment can't support (c)'s positive path, record the degradation verification explicitly.
- [ ] **Step 5: Commit ledger** (in the ConqrTasks root — the ledger file lives outside both git repos; just save it) and write the final report.

---

## Self-review notes

- Spec coverage: A4 = Tasks 1–4 (+3 external API per doc §10.3 parity); A3 = Tasks 5–7 (AI draft per §6.5 synergy); A2's fork seam F9 = Task 8; i18n/ledger/verify = 9–10.
- The `_can_modify` creator-or-admin rule appears in Tasks 2 and 5 — same pattern, different models; acceptable duplication across Django apps (extract later if a third user appears).
- Deliberate scope cuts: no MobX store (SWR precedent from conqr components; peek-scoped data), textarea (not rich editor) for updates v1, no workspace-level timesheet report (follow-up), no recurring/approval worklog features (Business-tier scope, later).
- Type names/signatures cross-checked: `TWorklog`/`TProjectUpdate`/`TConqrSimilarWorkItem` match their producing endpoints; `fetchSimilarWorkItems` body matches Hub's `WorkIntelQueryDto` (title/description/limit).
