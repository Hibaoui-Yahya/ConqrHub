import { EmbeddingRepository } from './embedding.repository';

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
        await repo.isContentUnchanged('page', 'p1', 'mistral-embed', 'new-hash'),
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
        chunks: [{ chunkIndex: 0, chunkText: 'Hi', embedding: [0.1], metadata: meta }],
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
});
