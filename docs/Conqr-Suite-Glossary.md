# Conqr Suite Glossary

One word per concept across ConqrHub and ConqrPlane (the Plane fork). UI copy,
docs, and i18n values in BOTH repos must use these terms. Internal identifiers
(i18n key names, DB columns, API fields like `issue_id`) are exempt.

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
| Suite / products | **Conqr suite**; **ConqrHub** (Knowledge & documentation); **ConqrPlane** (Projects & work management) | The Plane fork's user-visible product name is **ConqrPlane** — adopted from in-flight work already present in the plane repo (ConqrPlane wordmark logo, "New to ConqrPlane?" auth copy) instead of the earlier "ConqrTasks" idea. Applied on high-visibility surfaces (Hub app-switcher tile, Plane wordmark/title, power-k, auth screens, conqr_* i18n blocks). Deep copy (marketing/upgrade strings) is out of scope this pass. |

## Collision rules
- "Page(s)" in ConqrPlane UI may only refer to canonical ConqrHub pages. Plane-native notes are always "Project Notes".
- "Docs" in ConqrPlane = the mapped ConqrHub space, nothing else.
- "Issue" may appear only when naming external GitHub/GitLab objects.
- Hub page approval lifecycle ("Approval status": Draft → In approval → Approved → Obsolete) is distinct from ConqrPlane work-item "State" — do not merge the words.
- The assistant is "Conqr AI" everywhere (never "Pi", "Plane AI", "Conqrai AI").
