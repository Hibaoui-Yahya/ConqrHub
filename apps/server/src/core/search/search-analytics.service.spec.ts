import { SearchAnalyticsService } from './search-analytics.service';

describe('SearchAnalyticsService', () => {
  describe('normalizeQuery', () => {
    it('lowercases and trims surrounding whitespace', () => {
      expect(SearchAnalyticsService.normalizeQuery('  Hello World  ')).toBe(
        'hello world',
      );
    });

    it('truncates to the maximum length to keep the index small', () => {
      const long = 'a'.repeat(500);
      const normalized = SearchAnalyticsService.normalizeQuery(long);
      expect(normalized.length).toBeLessThanOrEqual(200);
    });

    it('returns empty string for whitespace-only input', () => {
      expect(SearchAnalyticsService.normalizeQuery('   ')).toBe('');
    });
  });

  describe('logQuery / logClick', () => {
    let inserts: Array<{ table: string; row: any }>;
    let service: SearchAnalyticsService;

    beforeEach(() => {
      inserts = [];
      const db: any = {
        insertInto: (table: string) => ({
          values: (row: any) => ({
            execute: async () => {
              inserts.push({ table, row });
            },
          }),
        }),
      };
      service = new SearchAnalyticsService(db);
    });

    it('records a normalized query event', async () => {
      await service.logQuery({
        workspaceId: 'ws-1',
        userId: 'user-1',
        query: '  PaY rOLL  ',
        resultCount: 4,
      });
      expect(inserts).toHaveLength(1);
      expect(inserts[0].table).toBe('searchEvents');
      expect(inserts[0].row).toMatchObject({
        workspaceId: 'ws-1',
        userId: 'user-1',
        eventType: 'query',
        query: 'pay roll',
        resultCount: 4,
      });
    });

    it('skips empty queries', async () => {
      await service.logQuery({
        workspaceId: 'ws-1',
        userId: 'user-1',
        query: '   ',
        resultCount: 0,
      });
      expect(inserts).toHaveLength(0);
    });

    it('records a click event with the page id', async () => {
      await service.logClick({
        workspaceId: 'ws-1',
        userId: 'user-1',
        query: 'Vacation Policy',
        pageId: 'page-9',
      });
      expect(inserts[0].row).toMatchObject({
        eventType: 'click',
        query: 'vacation policy',
        pageId: 'page-9',
        resultCount: null,
      });
    });

    it('prunes events older than the cutoff', async () => {
      const calls: any[] = [];
      const db: any = {
        deleteFrom: (table: string) => {
          calls.push({ table });
          const builder: any = {
            where: (col: string, op: string, value: any) => {
              calls.push({ where: { col, op, value } });
              return builder;
            },
            executeTakeFirst: async () => ({ numDeletedRows: 7n }),
          };
          return builder;
        },
      };
      const svc = new SearchAnalyticsService(db);
      const removed = await svc.pruneOldEvents(30);
      expect(removed).toBe(7);
      expect(calls[0]).toEqual({ table: 'searchEvents' });
      expect(calls[1].where.col).toBe('createdAt');
      expect(calls[1].where.op).toBe('<');
      expect(calls[1].where.value).toBeInstanceOf(Date);
    });

    it('swallows insert errors so search isn’t broken by analytics outages', async () => {
      const badDb: any = {
        insertInto: () => ({
          values: () => ({
            execute: async () => {
              throw new Error('db down');
            },
          }),
        }),
      };
      const bad = new SearchAnalyticsService(badDb);
      await expect(
        bad.logQuery({
          workspaceId: 'ws-1',
          userId: null,
          query: 'foo',
          resultCount: 1,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
