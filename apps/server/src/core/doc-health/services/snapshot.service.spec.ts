import { HealthSnapshotService } from './snapshot.service';
import { DocHealthService } from './doc-health.service';
import { KyselyDB } from '@docmost/db/types/kysely.types';

const NOW = new Date('2026-04-26T12:34:56Z');
const START_OF_DAY = new Date('2026-04-26T00:00:00Z');

type Inserted = { row: any };

function buildHarness(opts: { workspaces?: { id: string }[] } = {}) {
  const inserts: Inserted[] = [];
  const deletes: any[] = [];

  const trxBuilder = {
    insertInto: (_table: string) => ({
      values: (vals: any) => ({
        execute: async () => {
          if (Array.isArray(vals)) vals.forEach((row) => inserts.push({ row }));
          else inserts.push({ row: vals });
        },
      }),
    }),
    deleteFrom: (_table: string) => {
      const builder: any = {
        _filters: [] as any[],
        where(...args: any[]) {
          this._filters.push(args);
          return this;
        },
        async execute() {
          deletes.push({ filters: this._filters });
        },
      };
      return builder;
    },
  };

  // Workspace listing for captureAll
  const workspaces = opts.workspaces ?? [{ id: 'ws-1' }];
  const selectBuilder: any = {
    select: () => selectBuilder,
    where: () => selectBuilder,
    execute: async () => workspaces,
  };

  const db: Partial<KyselyDB> = {
    transaction: () =>
      ({
        execute: async (cb: any) => cb(trxBuilder),
      }) as any,
    selectFrom: (() => selectBuilder) as any,
    deleteFrom: trxBuilder.deleteFrom as any,
  };

  const docHealth: Partial<DocHealthService> = {
    getWorkspaceHealth: jest.fn().mockResolvedValue({
      score: 80,
      pageCount: 12,
      scoredPageCount: 12,
      signals: {
        freshness: 90,
        ownership: 80,
        verification: null,
        contentStrength: 75,
      },
      insufficientData: false,
      spaces: [
        { spaceId: 'sp-1', spaceName: 'Eng', spaceSlug: 'eng', isCritical: true, score: 70, pageCount: 10, insufficientData: false },
        { spaceId: 'sp-2', spaceName: 'HR', spaceSlug: 'hr', isCritical: false, score: 90, pageCount: 5, insufficientData: false },
      ],
    }),
    getSpaceHealth: jest.fn().mockImplementation((_w: string, spaceId: string) => ({
      score: spaceId === 'sp-1' ? 70 : 90,
      pageCount: spaceId === 'sp-1' ? 10 : 5,
      scoredPageCount: spaceId === 'sp-1' ? 10 : 5,
      signals: {
        freshness: 80,
        ownership: 80,
        verification: spaceId === 'sp-1' ? 60 : null,
        contentStrength: 80,
      },
      insufficientData: false,
    })),
  };

  const service = new HealthSnapshotService(
    db as KyselyDB,
    docHealth as DocHealthService,
  );

  return { service, inserts, deletes, docHealth };
}

describe('HealthSnapshotService', () => {
  describe('captureWorkspace', () => {
    it('inserts one workspace-level row + one row per space', async () => {
      const { service, inserts } = buildHarness();
      await service.captureWorkspace('ws-1', NOW);

      // Workspace-level row first, then per-space rows
      const workspaceLevel = inserts.filter((i) => i.row.spaceId === null);
      const perSpace = inserts.filter((i) => i.row.spaceId !== null);

      expect(workspaceLevel).toHaveLength(1);
      expect(perSpace).toHaveLength(2);
      expect(workspaceLevel[0].row.score).toBe(80);
    });

    it('captures captured_at at the start of the UTC day', async () => {
      const { service, inserts } = buildHarness();
      await service.captureWorkspace('ws-1', NOW);
      const row = inserts[0].row;
      expect((row.capturedAt as Date).getTime()).toBe(START_OF_DAY.getTime());
    });

    it('upserts: deletes existing rows for the day before inserting', async () => {
      const { service, deletes } = buildHarness();
      await service.captureWorkspace('ws-1', NOW);
      // First delete = workspace-level dedupe; second delete = per-space dedupe
      expect(deletes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('captureAll', () => {
    it('captures every workspace and reports counts', async () => {
      const { service, docHealth } = buildHarness({
        workspaces: [{ id: 'ws-1' }, { id: 'ws-2' }, { id: 'ws-3' }],
      });
      const result = await service.captureAll(NOW);
      expect(result.captured).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.workspaceIds).toEqual(['ws-1', 'ws-2', 'ws-3']);
      expect(docHealth.getWorkspaceHealth).toHaveBeenCalledTimes(3);
    });

    it('continues on per-workspace failures', async () => {
      const { service, docHealth } = buildHarness({
        workspaces: [{ id: 'ws-1' }, { id: 'ws-2' }],
      });
      let callCount = 0;
      (docHealth.getWorkspaceHealth as jest.Mock).mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) throw new Error('boom');
        return Promise.resolve({
          score: 100,
          pageCount: 10,
          scoredPageCount: 10,
          signals: {
            freshness: 100,
            ownership: 100,
            verification: null,
            contentStrength: 100,
          },
          insufficientData: false,
          spaces: [],
        });
      });

      const result = await service.captureAll(NOW);
      expect(result.captured).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.workspaceIds).toEqual(['ws-2']);
    });
  });
});
