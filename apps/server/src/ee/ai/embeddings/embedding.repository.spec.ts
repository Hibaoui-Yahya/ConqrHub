import { EmbeddingRepository } from './embedding.repository';

function makeConflictBuilder() {
  return {
    columns: () => ({
      doUpdateSet: () => undefined,
    }),
  };
}

function makeDb() {
  const deleteCalls: string[] = [];
  const upsertedChunks: unknown[] = [];

  const buildDeleteChain = (): any => ({
    where: () => buildDeleteChain(),
    execute: async () => {
      deleteCalls.push('delete');
    },
  });

  const db: any = {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          where: () => ({
            where: () => ({
              limit: () => ({
                executeTakeFirst: async () => undefined,
              }),
            }),
          }),
        }),
      }),
    }),
    deleteFrom: () => buildDeleteChain(),
    insertInto: () => ({
      values: (v: unknown) => ({
        onConflict: (cb: (oc: any) => any) => {
          cb(makeConflictBuilder());
          return {
            execute: async () => {
              upsertedChunks.push(v);
            },
          };
        },
        execute: async () => {
          upsertedChunks.push(v);
        },
      }),
    }),
    _deleteCalls: deleteCalls,
    _upsertedChunks: upsertedChunks,
  };

  return db;
}

describe('EmbeddingRepository', () => {
  let db: ReturnType<typeof makeDb>;
  let repo: EmbeddingRepository;

  beforeEach(() => {
    db = makeDb();
    repo = new EmbeddingRepository(db as any);
  });

  describe('isContentUnchanged()', () => {
    it('returns false when no row exists for the source', async () => {
      const result = await repo.isContentUnchanged(
        'page',
        'page-1',
        'mistral-embed',
        'abc123',
      );
      expect(result).toBe(false);
    });
  });

  describe('deleteBySource()', () => {
    it('issues a delete query', async () => {
      await repo.deleteBySource('page', 'page-uuid');
      expect(db._deleteCalls).toHaveLength(1);
    });
  });

  describe('deleteBySourceIds()', () => {
    it('does nothing for empty array', async () => {
      await repo.deleteBySourceIds('page', []);
      expect(db._deleteCalls).toHaveLength(0);
    });

    it('issues delete for non-empty array', async () => {
      await repo.deleteBySourceIds('page', ['id-1', 'id-2']);
      expect(db._deleteCalls).toHaveLength(1);
    });
  });

  describe('upsertChunks()', () => {
    it('calls deleteBySource when chunks array is empty', async () => {
      const deleteSpy = jest
        .spyOn(repo, 'deleteBySource')
        .mockResolvedValue();

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

    it('upserts one row per chunk', async () => {
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

      expect(db._upsertedChunks).toHaveLength(2);
    });

    it('issues a stale-chunk delete after upserting', async () => {
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

      // One delete for stale chunks (chunkIndex >= 1).
      expect(db._deleteCalls).toHaveLength(1);
    });
  });
});
