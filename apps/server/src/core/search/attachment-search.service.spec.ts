import {
  CamelCasePlugin,
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { AttachmentSearchService } from './attachment-search.service';

/**
 * A Kysely instance that compiles real PostgreSQL and records each query,
 * answering with the given rows. It checks the SQL the service builds and
 * the access filtering it applies afterwards; it does not run Postgres.
 */
function recordingDb(rows: any[]) {
  const queries: CompiledQuery[] = [];
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => ({
        init: async () => undefined,
        destroy: async () => undefined,
        acquireConnection: async () => ({
          executeQuery: async (q: CompiledQuery) => {
            queries.push(q);
            return { rows } as any;
          },
          streamQuery: async function* () {
            /* unused */
          },
        }),
        beginTransaction: async () => undefined,
        commitTransaction: async () => undefined,
        rollbackTransaction: async () => undefined,
        releaseConnection: async () => undefined,
      }),
      createIntrospector: (k: Kysely<any>) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
  return { db, queries };
}

function row(id: string, pageId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    fileName: `${id}.pdf`,
    fileExt: '.pdf',
    mimeType: 'application/pdf',
    pageId,
    creatorId: 'u-1',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    pageTitle: `Page ${pageId}`,
    pageSlugId: `slug-${pageId}`,
    spaceId: 's-1',
    spaceName: 'RH',
    spaceSlug: 'rh',
    spaceLogo: null,
    rank: '1.5',
    highlight: 'le <b>contrat</b> signé',
    ...extra,
  };
}

function makeService(
  rows: any[],
  opts: { spaces?: string[]; open?: string[] | Error } = {},
) {
  const { db, queries } = recordingDb(rows);
  const spaceMemberRepo = {
    getUserSpaceIds: jest.fn(async () => opts.spaces ?? ['s-1', 's-2']),
  };
  const pagePermissionRepo = {
    filterAccessiblePageIds: jest.fn(async ({ pageIds }: any) => {
      if (opts.open instanceof Error) throw opts.open;
      return opts.open ?? pageIds;
    }),
  };
  const service = new AttachmentSearchService(
    db as any,
    spaceMemberRepo as any,
    pagePermissionRepo as any,
  );
  return { service, queries, pagePermissionRepo };
}

const ctx = { userId: 'u-1', workspaceId: 'ws-1' };

describe('AttachmentSearchService', () => {
  it('answers nothing for an empty query without touching the database', async () => {
    const { service, queries } = makeService([row('a1', 'p1')]);
    expect(await service.search({ query: '   ' }, ctx)).toEqual({ items: [] });
    expect(queries).toHaveLength(0);
  });

  it('answers nothing to a reader who belongs to no space', async () => {
    const { service, queries } = makeService([row('a1', 'p1')], { spaces: [] });
    expect(await service.search({ query: 'contrat' }, ctx)).toEqual({ items: [] });
    expect(queries).toHaveLength(0);
  });

  it('searches file names and extracted text, only in the reader’s spaces', async () => {
    const { service, queries } = makeService([row('a1', 'p1')]);
    await service.search({ query: 'contrat_50%' }, ctx);

    expect(queries).toHaveLength(1);
    const { sql, parameters } = queries[0];
    expect(sql).toContain('"a"."workspace_id" = $');
    expect(sql).toContain('"a"."deleted_at" is null');
    expect(sql).toContain('"p"."deleted_at" is null');
    expect(sql).toMatch(/"p"\."space_id" in \(\$\d+, \$\d+\)/);
    expect(sql).toContain('f_unaccent(a.file_name) ilike');
    expect(sql).toContain("plainto_tsquery('simple'");
    expect(parameters).toEqual(expect.arrayContaining(['ws-1', 's-1', 's-2']));
    // "%" and "_" typed by the reader are escaped, not wildcards.
    expect(parameters).toContain('%contrat\\_50\\%%');
  });

  it('drops files of pages the reader cannot open', async () => {
    const { service } = makeService(
      [row('a1', 'p-open'), row('a2', 'p-restricted'), row('a3', 'p-open')],
      { open: ['p-open'] },
    );
    const { items } = await service.search({ query: 'contrat' }, ctx);
    expect(items.map((i) => i.id)).toEqual(['a1', 'a3']);
  });

  it('lists nothing when the access check fails (fail closed)', async () => {
    const { service } = makeService([row('a1', 'p1')], {
      open: new Error('db down'),
    });
    expect(await service.search({ query: 'contrat' }, ctx)).toEqual({ items: [] });
  });

  it('returns the shape the search screen expects', async () => {
    const { service } = makeService([row('a1', 'p1')]);
    const { items } = await service.search({ query: 'contrat', limit: 10 }, ctx);
    expect(items[0]).toMatchObject({
      id: 'a1',
      fileName: 'a1.pdf',
      pageId: 'p1',
      rank: 1.5,
      highlight: 'le <b>contrat</b> signé',
      space: { id: 's-1', name: 'RH', slug: 'rh', icon: null },
      page: { id: 'p1', title: 'Page p1', slugId: 'slug-p1' },
    });
  });
});
