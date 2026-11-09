# Release checks: LTC features to production

These scripts check the release that brings the LTC (client-latetechercheuse)
features to production. They were used on 2026-11-09, on a disposable local
Postgres and on the isolated Railway Staging environment. Run them from
`apps/server`.

**None of them may run against production or LTC.** The scripts that write
refuse `app.conqrhub.com` and `ltc.conqrhub.com`. The migration script writes in
every mode except `snapshot` and `verify`.

| Script | What it proves |
|---|---|
| `migration-dry-run.ts <dbUrl> <mode> [snapshotFile]` | The 7 release migrations on a database at the production level (last applied: `20260919T100000-suite-delegation-identity`). See the modes below. |
| `e2e-suite.cjs [main\|disabled]` | Hub + ConqrMeet BFF + mail catcher, end to end: ConqrAI branding, e-mails captured with links to the stack, SSO, Strict Private on pre-release and new meetings, read-only sharing, publishing into Hub, language of refusals, Hub logout ending the Meet session. `disabled` checks that publishing is refused when `MEETING_HUB_PUBLISHING` is unset. |
| `delegation-contract-check.cjs` | The ConqrFabric contract (Hub `CLAUDE.md`) with a **test** Ed25519 key pair: routes, scopes, response fields, and the status codes Fabric maps. |
| `oidc-login-check.cjs` | Sign-in through a **test** OIDC provider (for example `navikt/mock-oauth2-server`): PKCE, state, nonce, the subject link, and a forged callback that must not sign anyone in. |
| `storage-roundtrip-check.cjs` | With production's driver (local volume): upload, a byte-for-byte read-back, and refusal for a signed-out caller. |
| `rollback-smoke.cjs` | The **rollback build** (previous production code plus the 7 migration files, branch `rollback/main-compat-20261109`) on an already-migrated database. |

## Modes of `migration-dry-run.ts`

| Mode | Writes? | What it does |
|---|---|---|
| `full` | yes | Production baseline, synthetic data, then up, checks, down and up again. |
| `failinject` | yes | Makes the last migration fail and proves that none of the 7 is applied (one transaction). |
| `seed` | yes | Production baseline plus synthetic data (`EMB_ROWS` embeddings). |
| `upgrade` | yes | Applies the 7 migrations to a database already at the production level, then runs the checks. |
| `snapshot` | no (read-only) | Fingerprints of every table and of meeting ownership, written to a file. |
| `verify` | no (read-only) | After the **application** applied the migrations at startup, compares with that file. |

Reproducing the Railway shared-memory limit locally (the pgvector HNSW
rebuild): `docker run --shm-size=32m … pgvector/pgvector:pg17`.

Environment variables are documented at the top of each script.
