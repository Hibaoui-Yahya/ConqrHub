/**
 * ConqrHub — Conqr platform integration.
 *
 * The rules that decide which tenant's people reach which workspace's content.
 *
 * This service had no spec, which is the wrong way round: it is the smallest file in the
 * integration and the one whose mistakes are least recoverable. A wrong binding does not refuse
 * anybody — it silently points a tenant at somebody else's workspace, and the first symptom is
 * content appearing where it should not.
 *
 * Kysely is substituted with a recording double rather than a real database, because what is
 * under test is the decision order: which refusals happen, and *before which writes*. A test
 * against a live database would prove the same rules hold once, where this proves the insert is
 * not reached at all when a conflict exists.
 */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TenantBindingService } from './tenant-binding.service';

const TENANT_A = 'conqr:tenant:01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TENANT_B = 'conqr:tenant:01ARZ3NDEKTSV4RRFFQ69G5FBW';
const WORKSPACE_A = '00000000-0000-7000-8000-00000000000a';
const WORKSPACE_B = '00000000-0000-7000-8000-00000000000b';
const APP = 'conqrhub';
/** A ConqrHub user id: created_by is a uuid referencing users.id, not a person's name. */
const OPERATOR = '00000000-0000-7000-8000-0000000000c1';

interface Row {
  id: string;
  conqrTenantId: string;
  applicationId: string;
  workspaceId: string;
  status: string;
  revision: number;
}

/**
 * Column names as this application's connection resolves them.
 *
 * The real Kysely is built with `CamelCasePlugin`: a query may name a column in either case, and
 * every row comes back camelCase. The double has to do the same, and the reason is not tidiness.
 * When it stored rows under the snake_case names the queries use, the service could read
 * `row.conqr_tenant_id` and these tests passed — while production, which camelCases its results,
 * returned `undefined` for every field. The double agreed with the service about a database
 * neither of them was talking to.
 */
const asStored = (column: string): string =>
  column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * A Kysely double over two in-memory tables.
 *
 * It implements only the shapes this service uses, and deliberately fails loudly on anything else:
 * a query the double silently mis-answers would make the tests agree with themselves rather than
 * with the service.
 */
function fakeDb(seed: { bindings?: Row[]; workspaces?: string[] } = {}) {
  const bindings: Row[] = [...(seed.bindings ?? [])];
  const workspaces = new Set(seed.workspaces ?? [WORKSPACE_A, WORKSPACE_B]);
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];

  const selectFrom = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const builder: Record<string, unknown> = {
      selectAll: () => builder,
      select: () => builder,
      where: (col: string, op: string, val: unknown) => {
        if (op !== '=') throw new Error(`unsupported operator ${op}`);
        filters.push([asStored(col), val]);
        return builder;
      },
      orderBy: () => builder,
      execute: async () => matches(),
      executeTakeFirst: async () => matches()[0],
    };
    const matches = () => {
      if (table === 'workspaces') {
        const id = filters.find(([c]) => c === 'id')?.[1] as string | undefined;
        return id !== undefined && workspaces.has(id) ? [{ id }] : [];
      }
      if (table !== 'platform_tenant_bindings') throw new Error(`unexpected table ${table}`);
      return bindings.filter((row) =>
        filters.every(([col, val]) => (row as unknown as Record<string, unknown>)[col] === val),
      );
    };
    return builder;
  };

  const db = {
    selectFrom,
    insertInto: (table: string) => {
      if (table !== 'platform_tenant_bindings') throw new Error(`unexpected insert into ${table}`);
      let pending: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        values: (v: Record<string, unknown>) => {
          pending = Object.fromEntries(
            Object.entries(v).map(([k, value]) => [asStored(k), value]),
          );
          return builder;
        },
        returningAll: () => builder,
        executeTakeFirstOrThrow: async () => {
          inserts.push(pending);
          const row = { id: `binding-${bindings.length + 1}`, ...pending } as unknown as Row;
          bindings.push(row);
          return row;
        },
      };
      return builder;
    },
    updateTable: (table: string) => {
      if (table !== 'platform_tenant_bindings') throw new Error(`unexpected update to ${table}`);
      let pending: Record<string, unknown> = {};
      const filters: Array<[string, unknown]> = [];
      const builder: Record<string, unknown> = {
        set: (v: Record<string, unknown>) => {
          pending = Object.fromEntries(
            Object.entries(v).map(([k, value]) => [asStored(k), value]),
          );
          return builder;
        },
        where: (col: string, _op: string, val: unknown) => {
          filters.push([asStored(col), val]);
          return builder;
        },
        execute: async () => {
          updates.push(pending);
          for (const row of bindings) {
            const hit = filters.every(
              ([col, val]) => (row as unknown as Record<string, unknown>)[col] === val,
            );
            if (hit) Object.assign(row, pending);
          }
          return [];
        },
      };
      return builder;
    },
  };

  return { db, bindings, inserts, updates };
}

const row = (over: Partial<Row> = {}): Row => ({
  id: 'binding-0',
  conqrTenantId: TENANT_A,
  applicationId: APP,
  workspaceId: WORKSPACE_A,
  status: 'active',
  revision: 1,
  ...over,
});

const serviceOver = (seed: Parameters<typeof fakeDb>[0] = {}) => {
  const fake = fakeDb(seed);
  return { fake, service: new TenantBindingService(fake.db as never) };
};

describe('TenantBindingService.resolve', () => {
  it('returns the binding for this tenant and application', async () => {
    const { service } = serviceOver({ bindings: [row()] });
    const found = await service.resolve(TENANT_A, APP);
    expect(found?.workspaceId).toBe(WORKSPACE_A);
  });

  it('resolves nothing for a tenant with no binding', async () => {
    const { service } = serviceOver({ bindings: [row()] });
    expect(await service.resolve(TENANT_B, APP)).toBeUndefined();
  });

  it('never widens to another application', async () => {
    // The binding is per (tenant, application). A tenant set up for one product must not resolve
    // for another, or entitlement to one application would confer a workspace in the next.
    const { service } = serviceOver({ bindings: [row()] });
    expect(await service.resolve(TENANT_A, 'conqrplan')).toBeUndefined();
  });

  it('ignores a retired binding', async () => {
    const { service } = serviceOver({ bindings: [row({ status: 'retired' })] });
    expect(await service.resolve(TENANT_A, APP)).toBeUndefined();
  });

  it('reports the revision as a number even when the driver returns a string', async () => {
    // Postgres bigints arrive as strings through some drivers, and a string revision compares
    // wrongly against a numeric watermark without ever throwing.
    const { service } = serviceOver({
      bindings: [row({ revision: '7' as unknown as number })],
    });
    const found = await service.resolve(TENANT_A, APP);
    expect(found?.revision).toBe(7);
  });
});

describe('TenantBindingService.bind', () => {
  it('binds a tenant to an existing workspace', async () => {
    const { service, fake } = serviceOver();
    const bound = await service.bind({
      conqrTenantId: TENANT_A,
      applicationId: APP,
      workspaceId: WORKSPACE_A,
      createdBy: OPERATOR,
    });
    expect(bound.workspaceId).toBe(WORKSPACE_A);
    expect(fake.inserts).toHaveLength(1);
    expect(fake.inserts[0]).toMatchObject({ status: 'active', createdBy: OPERATOR });
  });

  it('refuses a creator that is not a user id, and writes nothing', async () => {
    // `created_by` references users.id. The operator command used to fill it from USER/USERNAME —
    // an operating-system account name — so every real invocation died inside Postgres with
    // "invalid input syntax for type uuid" and no binding could be created by the only path that
    // existed to create one. Refused here, where the message can say which argument was wrong.
    const { service, fake } = serviceOver();
    await expect(
      service.bind({
        conqrTenantId: TENANT_A,
        applicationId: APP,
        workspaceId: WORKSPACE_A,
        createdBy: 'YahyaHibaoui',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fake.inserts).toHaveLength(0);
  });

  it('refuses a workspace that does not exist, and writes nothing', async () => {
    // The refusal matters less than the "writes nothing": a binding to a missing workspace would
    // resolve successfully forever and refuse every login downstream of it.
    const { service, fake } = serviceOver({ workspaces: [WORKSPACE_A] });
    await expect(
      service.bind({ conqrTenantId: TENANT_A, applicationId: APP, workspaceId: 'no-such' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(fake.inserts).toHaveLength(0);
  });

  it('is idempotent for the same tenant and workspace', async () => {
    const { service, fake } = serviceOver({ bindings: [row()] });
    const again = await service.bind({
      conqrTenantId: TENANT_A,
      applicationId: APP,
      workspaceId: WORKSPACE_A,
    });
    expect(again.workspaceId).toBe(WORKSPACE_A);
    expect(fake.inserts).toHaveLength(0);
  });

  it('refuses to move a tenant to a different workspace', async () => {
    // Silently repointing a tenant moves everybody's data. Retiring the old binding first makes
    // the act visible, which is the whole reason this is a conflict rather than an update.
    const { service, fake } = serviceOver({ bindings: [row()] });
    await expect(
      service.bind({ conqrTenantId: TENANT_A, applicationId: APP, workspaceId: WORKSPACE_B }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fake.inserts).toHaveLength(0);
  });

  it('refuses to bind a workspace that already belongs to another tenant', async () => {
    // The dangerous direction: two tenants sharing one workspace means each tenant's people read
    // the other's content, and nothing in the request looks wrong.
    const { service, fake } = serviceOver({ bindings: [row()] });
    await expect(
      service.bind({ conqrTenantId: TENANT_B, applicationId: APP, workspaceId: WORKSPACE_A }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fake.inserts).toHaveLength(0);
  });

  it('allows a workspace freed by retiring its previous binding', async () => {
    const { service, fake } = serviceOver({ bindings: [row({ status: 'retired' })] });
    const bound = await service.bind({
      conqrTenantId: TENANT_B,
      applicationId: APP,
      workspaceId: WORKSPACE_A,
    });
    expect(bound.conqrTenantId).toBe(TENANT_B);
    expect(fake.inserts).toHaveLength(1);
  });
});

describe('TenantBindingService.retire', () => {
  it('retires the active binding and leaves the workspace alone', async () => {
    const { service, fake } = serviceOver({ bindings: [row()] });
    await service.retire(TENANT_A, APP);
    expect(fake.updates[0]).toMatchObject({ status: 'retired' });
    expect(await service.resolve(TENANT_A, APP)).toBeUndefined();
  });

  it('is harmless when there is nothing to retire', async () => {
    const { service } = serviceOver();
    await expect(service.retire(TENANT_A, APP)).resolves.toBeUndefined();
  });
});
