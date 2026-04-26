import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HealthAlertsService } from './alerts.service';

const NOW = new Date('2026-04-26T12:00:00Z');

type Sub = {
  id: string;
  userId: string;
  workspaceId: string;
  spaceId: string | null;
  threshold: number;
  lastFiredAt: Date | null;
  createdAt: Date;
};

function buildHarness(opts: {
  subs?: Sub[];
  latestByScope?: Record<string, number | null>;
} = {}) {
  const subs: Sub[] = opts.subs ?? [];
  const updates: Array<{ id: string; lastFiredAt: Date }> = [];
  const fired: any[] = [];

  // Build a fluent query builder mock that supports the calls we make.
  const builder = (rows: any[]) => {
    const b: any = {
      _rows: rows,
      select: () => b,
      selectAll: () => b,
      where: () => b,
      orderBy: () => b,
      execute: async () => b._rows,
      executeTakeFirst: async () => b._rows[0] ?? null,
      executeTakeFirstOrThrow: async () => {
        if (!b._rows[0]) throw new Error('no row');
        return b._rows[0];
      },
      returningAll: () => b,
      set: () => b,
      values: (v: any) => {
        const next = builder([{ ...v, id: 'sub-new', createdAt: NOW, lastFiredAt: null }]);
        return next;
      },
    };
    return b;
  };

  let latestRows: Array<{ spaceId: string | null; score: number | null }> =
    Object.entries(opts.latestByScope ?? { __workspace__: null }).map(
      ([scope, score]) => ({
        spaceId: scope === '__workspace__' ? null : scope,
        score,
      }),
    );

  const db: any = {
    selectFrom: (table: string) => {
      if (table === 'docHealthAlertSubscriptions') return builder(subs);
      if (table === 'spaces') return builder([{ id: 'sp-1' }]);
      if (table.startsWith('docHealthSnapshots'))
        return builder(latestRows);
      return builder([]);
    },
    insertInto: () => builder([]),
    updateTable: () => ({
      set: (vals: any) => ({
        where: (_col: string, _op: string, val: string) => ({
          execute: async () => {
            updates.push({ id: val, lastFiredAt: vals.lastFiredAt });
          },
          returningAll: () => ({
            executeTakeFirstOrThrow: async () => ({
              ...subs.find((s) => s.id === val),
              ...vals,
            }),
          }),
        }),
      }),
    }),
    deleteFrom: () => ({
      where: () => ({ execute: async () => undefined }),
    }),
  };

  const notification: any = {
    create: jest.fn().mockImplementation(async (data: any) => {
      fired.push(data);
      return { id: 'notif-1' };
    }),
  };

  const service = new HealthAlertsService(db, notification);
  return { service, fired, updates, notification };
}

describe('HealthAlertsService', () => {
  describe('subscribe', () => {
    it('rejects threshold outside 0-100', async () => {
      const { service } = buildHarness();
      await expect(
        service.subscribe({
          userId: 'u1',
          workspaceId: 'w1',
          threshold: 150,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative threshold', async () => {
      const { service } = buildHarness();
      await expect(
        service.subscribe({
          userId: 'u1',
          workspaceId: 'w1',
          threshold: -5,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unsubscribe', () => {
    it('throws NotFound when the subscription does not exist', async () => {
      const { service } = buildHarness({ subs: [] });
      await expect(
        service.unsubscribe({
          userId: 'u1',
          workspaceId: 'w1',
          subscriptionId: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluateForWorkspace', () => {
    const baseSub: Sub = {
      id: 'sub-1',
      userId: 'u1',
      workspaceId: 'w1',
      spaceId: null,
      threshold: 70,
      lastFiredAt: null,
      createdAt: NOW,
    };

    it('fires when score is below threshold', async () => {
      const { service, fired } = buildHarness({
        subs: [baseSub],
        latestByScope: { __workspace__: 50 },
      });
      const result = await service.evaluateForWorkspace('w1', NOW);
      expect(result.fired).toBe(1);
      expect(fired).toHaveLength(1);
      expect(fired[0].type).toBe('doc_health.dropped');
    });

    it('does not fire when score is at or above threshold', async () => {
      const { service, fired } = buildHarness({
        subs: [baseSub],
        latestByScope: { __workspace__: 70 },
      });
      const result = await service.evaluateForWorkspace('w1', NOW);
      expect(result.fired).toBe(0);
      expect(fired).toHaveLength(0);
    });

    it('does not fire when score is null (insufficient data)', async () => {
      const { service, fired } = buildHarness({
        subs: [baseSub],
        latestByScope: { __workspace__: null },
      });
      const result = await service.evaluateForWorkspace('w1', NOW);
      expect(result.fired).toBe(0);
      expect(fired).toHaveLength(0);
    });

    it('respects the 24h dedupe window', async () => {
      const recentlyFired: Sub = {
        ...baseSub,
        lastFiredAt: new Date(NOW.getTime() - 60 * 60 * 1000), // 1h ago
      };
      const { service, fired } = buildHarness({
        subs: [recentlyFired],
        latestByScope: { __workspace__: 30 },
      });
      const result = await service.evaluateForWorkspace('w1', NOW);
      expect(result.fired).toBe(0);
      expect(fired).toHaveLength(0);
    });

    it('fires again after the dedupe window passes', async () => {
      const oldFired: Sub = {
        ...baseSub,
        lastFiredAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000), // 25h ago
      };
      const { service, fired } = buildHarness({
        subs: [oldFired],
        latestByScope: { __workspace__: 30 },
      });
      const result = await service.evaluateForWorkspace('w1', NOW);
      expect(result.fired).toBe(1);
      expect(fired).toHaveLength(1);
    });
  });
});
