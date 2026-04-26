# Database & Migrations

Day-to-day workflow for the data layer. Background and architecture in [`../architecture/backend.md`](../architecture/backend.md). Schema reference in [`../reference/database-schema.md`](../reference/database-schema.md).

## Stack

- **PostgreSQL 14+** (with `unaccent` extension for accent-insensitive search)
- **Kysely** — type-safe SQL builder
- **kysely-codegen** — generates `apps/server/src/database/types/db.d.ts` from the live schema

## Commands (run from `apps/server`)

```bash
pnpm migration:create     # Create a new migration (timestamped filename)
pnpm migration:up         # Run the next pending migration
pnpm migration:latest     # Run all pending migrations
pnpm migration:down       # Rollback the last migration
pnpm migration:codegen    # Regenerate types from current schema
```

## Where things live

```
apps/server/src/database/
├── migrations/              Timestamped migration files (43+)
│   ├── 20260101T000000-something.ts
│   └── …
├── repos/                   Repo classes (one per table or table group)
├── types/db.d.ts            Auto-generated schema types — do not hand-edit
└── kysely.module.ts         Kysely setup and DI
```

## Migration filename convention

```
YYYYMMDDTHHMMSS-name.ts
```

Each migration exports `up` and `down` functions:

```ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('your_table')
    .addColumn('id', 'uuid', col => col.primaryKey())
    .addColumn('workspace_id', 'uuid', col => col.notNull())
    .addColumn('created_at', 'timestamptz', col => col.notNull().defaultTo('now()'))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('your_table').execute();
}
```

## Adding a migration — step by step

1. **Plan the change.** Decide table name(s), columns, indexes, foreign keys, and whether you need to backfill existing data.
2. `pnpm migration:create your-migration-name` from `apps/server`.
3. Edit the generated file — write `up` and `down`. Always write `down` so rollback is possible.
4. **Run it locally:** `pnpm migration:latest`.
5. **Regenerate types:** `pnpm migration:codegen`.
6. **Update the matching repo class** in `database/repos/`. Every table should have a repo with typed methods (`find`, `findById`, `insert`, `update`, `delete`, plus domain queries).
7. **Wire the new repo into the DI container** if it's a new module.
8. **Update [`../reference/database-schema.md`](../reference/database-schema.md)** — keep the public schema reference in sync.
9. **Test the rollback** — `pnpm migration:down` then `pnpm migration:up` again.

## Type generation

`pnpm migration:codegen` introspects the live database and regenerates `types/db.d.ts`. This file is **committed** to the repo (so reviewers can see the diff) but should never be hand-edited.

Common gotcha: forgetting to run codegen after a migration. CI should fail if `db.d.ts` is out of date.

## Repo pattern

Repos sit between Kysely and the service layer. They:

- **Encapsulate** typed queries.
- **Soft-delete-aware** by default (use `deleted_at IS NULL` filters).
- **Workspace-scoped** queries everywhere — there should never be a query that returns rows from another workspace.

```ts
// apps/server/src/database/repos/page.repo.ts (sketch)
@Injectable()
export class PageRepo {
  constructor(@InjectKysely() private db: KyselyDb) {}

  async findById(id: string, workspaceId: string) {
    return this.db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', id)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
  }
}
```

## Soft delete

Most "delete" operations set `deleted_at`. Only certain admin-triggered actions hard-delete:

- **Trash retention** runs on `AUDIT_QUEUE` / `GENERAL_QUEUE` and hard-deletes pages past the retention window.
- **Audit log retention** hard-deletes audit rows past their window.

When you write a new query, default to filtering out `deleted_at IS NOT NULL`.

## Indexing

Common index patterns:

- All FK columns: B-tree
- All `tsv` (full-text) columns: GIN
- Multi-tenant queries: `(workspace_id, …)` composite indexes
- Soft-delete-heavy tables: partial indexes `WHERE deleted_at IS NULL`

## Testing migrations

The test suite uses a separate test database and runs `migration:latest` before tests. If your migration is destructive in a way that affects existing data, add a unit test that exercises the migration path explicitly.

## Production migrations

- **Forward-compatible only** — never remove a column the running app still reads.
- **Use a two-phase approach** for breaking changes: deploy app code that handles both old and new schema, then run migration, then remove the old branch.
- **Avoid long table locks.** For large tables, prefer `ALTER ... NOT VALID` + later `VALIDATE CONSTRAINT` patterns over plain `NOT NULL` adds.

For backups and DR, see [`../deployment/`](../deployment/README.md).
