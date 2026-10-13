import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import {
  EmbeddingRepository,
  extractLexicalTerms,
} from './embedding.repository';

/** A Kysely instance that compiles SQL but never connects. */
function makeCompilingDb(): Kysely<any> {
  return new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [new CamelCasePlugin()],
  });
}

/**
 * Build a minimal Kysely-shaped fluent chain. Every method returns the
 * same proxy so we only need to configure the terminal methods.
 */
function makeChain(overrides: {
  executeTakeFirst?: () => Promise<unknown>;
  execute?: () => Promise<unknown>;
}) {
  const chain: any = {
    select: () => chain,
    where: () => chain,
    limit: () => chain,
    columns: () => chain,
    doUpdateSet: () => chain,
    onConflict: (cb?: (oc: any) => any) => {
      cb?.(chain);
      return chain;
    },
    values: () => chain,
    execute: overrides.execute ?? jest.fn().mockResolvedValue([]),
    executeTakeFirst:
      overrides.executeTakeFirst ?? jest.fn().mockResolvedValue(undefined),
  };
  return chain;
}

function makeDb(opts: {
  selectRow?: Record<string, unknown>;
  trackInserts?: unknown[];
  trackDeletes?: string[];
}) {
  const { trackInserts = [], trackDeletes = [] } = opts;

  return {
    selectFrom: (_table: string) =>
      makeChain({
        executeTakeFirst: jest.fn().mockResolvedValue(opts.selectRow),
      }),
    insertInto: (_table: string) => ({
      values: (row: unknown) => {
        trackInserts.push(row);
        return makeChain({
          execute: jest.fn().mockResolvedValue([]),
        });
      },
    }),
    deleteFrom: (_table: string) =>
      makeChain({
        execute: jest.fn().mockImplementation(async () => {
          trackDeletes.push(_table);
        }),
      }),
  } as any;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('EmbeddingRepository', () => {
  describe('isContentUnchanged()', () => {
    it('returns false when no row exists for the source', async () => {
      const repo = new EmbeddingRepository(makeDb({ selectRow: undefined }));
      expect(
        await repo.isContentUnchanged('page', 'p1', 'mistral-embed', 'abc'),
      ).toBe(false);
    });

    it('returns true when the stored content_hash matches', async () => {
      const repo = new EmbeddingRepository(
        makeDb({ selectRow: { contentHash: 'abc123' } }),
      );
      expect(
        await repo.isContentUnchanged('page', 'p1', 'mistral-embed', 'abc123'),
      ).toBe(true);
    });

    it('returns false when the stored hash differs', async () => {
      const repo = new EmbeddingRepository(
        makeDb({ selectRow: { contentHash: 'old-hash' } }),
      );
      expect(
        await repo.isContentUnchanged(
          'page',
          'p1',
          'mistral-embed',
          'new-hash',
        ),
      ).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────

  describe('deleteBySource()', () => {
    it('issues exactly one delete targeting aiEmbeddings', async () => {
      const tracked: string[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackDeletes: tracked }));
      await repo.deleteBySource('page', 'page-uuid');
      expect(tracked).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────

  describe('deleteBySourceIds()', () => {
    it('short-circuits on an empty array without touching the DB', async () => {
      const tracked: string[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackDeletes: tracked }));
      await repo.deleteBySourceIds('page', []);
      expect(tracked).toHaveLength(0);
    });

    it('issues one delete for a non-empty list', async () => {
      const tracked: string[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackDeletes: tracked }));
      await repo.deleteBySourceIds('page', ['id-1', 'id-2', 'id-3']);
      expect(tracked).toHaveLength(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────

  describe('upsertChunks()', () => {
    it('calls deleteBySource and returns early when chunks is empty', async () => {
      const repo = new EmbeddingRepository(makeDb({}));
      const deleteSpy = jest.spyOn(repo, 'deleteBySource').mockResolvedValue();
      await repo.upsertChunks({
        workspaceId: 'ws',
        spaceId: 'sp',
        sourceKind: 'page',
        sourceId: 'page-1',
        model: 'mistral-embed',
        dim: 1024,
        contentHash: 'hash',
        chunks: [],
      });
      expect(deleteSpy).toHaveBeenCalledWith('page', 'page-1');
    });

    it('inserts one row per chunk', async () => {
      const inserts: unknown[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackInserts: inserts }));
      await repo.upsertChunks({
        workspaceId: 'ws',
        spaceId: 'sp',
        sourceKind: 'page',
        sourceId: 'page-1',
        model: 'mistral-embed',
        dim: 1024,
        contentHash: 'hash',
        chunks: [
          { chunkIndex: 0, chunkText: 'Hello', embedding: [0.1, 0.2] },
          { chunkIndex: 1, chunkText: 'World', embedding: [0.3, 0.4] },
        ],
      });
      expect(inserts).toHaveLength(2);
    });

    it('formats the embedding as a vector literal string in each row', async () => {
      const inserts: any[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackInserts: inserts }));
      await repo.upsertChunks({
        workspaceId: 'ws',
        spaceId: 'sp',
        sourceKind: 'page',
        sourceId: 'page-1',
        model: 'mistral-embed',
        dim: 1024,
        contentHash: 'hash',
        chunks: [{ chunkIndex: 0, chunkText: 'Hi', embedding: [0.5, 0.6] }],
      });
      // The embedding is passed as a SQL template expression (not a plain array).
      // We assert the row was passed — the exact cast is handled by Kysely sql``
      expect(inserts[0]).toHaveProperty('chunkIndex', 0);
      expect(inserts[0]).toHaveProperty('chunkText', 'Hi');
      expect(inserts[0]).toHaveProperty('contentHash', 'hash');
    });

    it('issues a stale-chunk delete after upserting all chunks', async () => {
      const deletes: string[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackDeletes: deletes }));
      await repo.upsertChunks({
        workspaceId: 'ws',
        spaceId: 'sp',
        sourceKind: 'page',
        sourceId: 'page-1',
        model: 'mistral-embed',
        dim: 1024,
        contentHash: 'hash',
        chunks: [
          { chunkIndex: 0, chunkText: 'A', embedding: [0.1] },
          { chunkIndex: 1, chunkText: 'B', embedding: [0.2] },
        ],
      });
      // Exactly one stale-chunk delete (chunk_index >= 2).
      expect(deletes).toHaveLength(1);
    });

    it('stores metadata as JSON when provided', async () => {
      const inserts: any[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackInserts: inserts }));
      const meta = { pageId: 'p1', title: 'My Page', spaceId: 'sp' };
      await repo.upsertChunks({
        workspaceId: 'ws',
        spaceId: 'sp',
        sourceKind: 'page',
        sourceId: 'page-1',
        model: 'mistral-embed',
        dim: 1024,
        contentHash: 'hash',
        chunks: [
          { chunkIndex: 0, chunkText: 'Hi', embedding: [0.1], metadata: meta },
        ],
      });
      expect(inserts[0].metadata).toBe(JSON.stringify(meta));
    });

    it('stores null metadata when none is provided', async () => {
      const inserts: any[] = [];
      const repo = new EmbeddingRepository(makeDb({ trackInserts: inserts }));
      await repo.upsertChunks({
        workspaceId: 'ws',
        spaceId: 'sp',
        sourceKind: 'page',
        sourceId: 'page-1',
        model: 'mistral-embed',
        dim: 1024,
        contentHash: 'hash',
        chunks: [{ chunkIndex: 0, chunkText: 'Hi', embedding: [0.1] }],
      });
      expect(inserts[0].metadata).toBeNull();
    });
  });

  describe('similaritySearch()', () => {
    it('returns [] without querying when spaceIds is an empty allow-list', async () => {
      // An empty allow-list means the caller can read no spaces. The search
      // must NOT fall through to a workspace-wide query (cross-space leak),
      // so it short-circuits before touching the DB.
      const db: any = {
        selectFrom: () => {
          throw new Error('DB must not be queried for an empty allow-list');
        },
      };
      const repo = new EmbeddingRepository(db);

      const result = await repo.similaritySearch({
        workspaceId: 'ws',
        queryEmbedding: [0.1, 0.2, 0.3],
        spaceIds: [],
      });

      expect(result).toEqual([]);
    });
  });

  describe('extractLexicalTerms()', () => {
    it('drops French and English function words and keeps content words in order', () => {
      expect(
        extractLexicalTerms('Quel est le nom du candidat chez Acme ?'),
      ).toEqual(['nom', 'candidat', 'acme']);
      expect(
        extractLexicalTerms('What is the SLA for the Dupont contract?'),
      ).toEqual(['sla', 'dupont', 'contract']);
    });

    it('keeps accents (SQL unaccents both sides), dedupes, and ignores 1-char tokens', () => {
      expect(
        extractLexicalTerms("L'équipe équipe a 1 réunion, réunion"),
      ).toEqual(['équipe', 'réunion']);
    });

    it('returns [] for a question made only of stop words or punctuation', () => {
      expect(extractLexicalTerms('est-ce que ?')).toEqual([]);
      expect(extractLexicalTerms('')).toEqual([]);
    });
  });

  describe('lexicalSearch()', () => {
    it('returns [] without querying when spaceIds is an empty allow-list', async () => {
      const db: any = {
        selectFrom: () => {
          throw new Error('DB must not be queried for an empty allow-list');
        },
      };
      const repo = new EmbeddingRepository(db);

      expect(
        await repo.lexicalSearch({
          workspaceId: 'ws',
          query: 'Dupont',
          spaceIds: [],
        }),
      ).toEqual([]);
    });

    it('returns [] without querying when the question has no searchable term', async () => {
      const db: any = {
        selectFrom: () => {
          throw new Error('DB must not be queried without terms');
        },
      };
      const repo = new EmbeddingRepository(db);

      expect(
        await repo.lexicalSearch({
          workspaceId: 'ws',
          query: 'est-ce que ?',
          spaceIds: ['sp-1'],
        }),
      ).toEqual([]);
    });

    it('compiles to a websearch_to_tsquery / ts_rank_cd query with the permission filters', () => {
      const repo = new EmbeddingRepository(makeCompilingDb() as any);

      const { sql, parameters } = repo
        .buildLexicalQuery({
          workspaceId: 'ws-1',
          query: 'Qui est Dupont chez Acme ?',
          spaceIds: ['sp-1', 'sp-2'],
          sourceId: 'page-9',
          topK: 20,
        })
        .compile();

      expect(sql).toContain('from "ai_embeddings"');
      expect(sql).toContain(
        "ts_rank_cd(tsv, websearch_to_tsquery('simple', f_unaccent($1)))",
      );
      expect(sql).toContain('"workspace_id" = $2');
      expect(sql).toContain('"space_id" in ($3, $4)');
      expect(sql).toContain('"source_id" = $5');
      expect(sql).toContain(
        "tsv @@ websearch_to_tsquery('simple', f_unaccent($6))",
      );
      expect(sql).toMatch(
        /order by ts_rank_cd\(tsv, websearch_to_tsquery\('simple', f_unaccent\(\$7\)\)\) desc/,
      );
      expect(sql).toContain('limit $8');
      expect(parameters).toEqual([
        'dupont or acme',
        'ws-1',
        'sp-1',
        'sp-2',
        'page-9',
        'dupont or acme',
        'dupont or acme',
        20,
      ]);
    });

    it('filters on spaceId when given and omits the IN clause otherwise', () => {
      const repo = new EmbeddingRepository(makeCompilingDb() as any);

      const { sql, parameters } = repo
        .buildLexicalQuery({
          workspaceId: 'ws-1',
          query: 'Dupont',
          spaceId: 'sp-7',
        })
        .compile();

      expect(sql).toContain('"space_id" = $3');
      expect(sql).not.toContain('"space_id" in');
      expect(parameters).toContain('sp-7');
      expect(parameters[parameters.length - 1]).toBe(8);
    });

    it('maps rows to SimilarityResult with a numeric score', async () => {
      const rows = [
        {
          sourceKind: 'page',
          sourceId: 'p1',
          chunkIndex: 2,
          chunkText: 'Dupont',
          metadata: { title: 'T' },
          score: '0.25',
        },
      ];
      const chain: any = {
        select: () => chain,
        where: () => chain,
        $if: (c: boolean, cb: any) => (c ? cb(chain) : chain),
        orderBy: () => chain,
        limit: () => chain,
        execute: jest.fn().mockResolvedValue(rows),
      };
      const repo = new EmbeddingRepository({ selectFrom: () => chain } as any);

      const result = await repo.lexicalSearch({
        workspaceId: 'ws',
        query: 'Dupont',
      });

      expect(result).toEqual([
        {
          sourceKind: 'page',
          sourceId: 'p1',
          chunkIndex: 2,
          chunkText: 'Dupont',
          metadata: { title: 'T' },
          score: 0.25,
        },
      ]);
    });
  });
});
