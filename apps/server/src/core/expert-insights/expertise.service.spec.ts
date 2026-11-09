import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CamelCasePlugin,
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { ExpertiseService } from './expertise.service';
import { ExpertiseRepo } from './expertise.repo';

const user = { id: 'u-1', workspaceId: 'ws-1' } as any;

function insight(extra: Record<string, unknown> = {}) {
  return {
    id: 'i-1',
    workspaceId: 'ws-1',
    spaceId: 's-1',
    pageId: 'p-1',
    status: 'published',
    ...extra,
  };
}

function makeService(opts: {
  insight?: any;
  canRead?: boolean;
  openPages?: string[];
}) {
  const insightsRepo = {
    findById: jest.fn(async () => opts.insight),
  };
  const expertiseRepo = {
    setVote: jest.fn(async () => ({ helpfulCount: 4, notHelpfulCount: 1 })),
    findVotes: jest.fn(async () => ({})),
    search: jest.fn(async () => []),
  };
  const spaceAbility = {
    createForUser: jest.fn(async () => ({
      can: () => opts.canRead !== false,
      cannot: () => opts.canRead === false,
    })),
  };
  const spaceMemberRepo = { getUserSpaceIds: jest.fn(async () => ['s-1']) };
  const pagePermissionRepo = {
    filterAccessiblePageIds: jest.fn(async ({ pageIds }: any) =>
      pageIds.filter((id: string) => (opts.openPages ?? ['p-1']).includes(id)),
    ),
  };
  const service = new ExpertiseService(
    insightsRepo as any,
    expertiseRepo as any,
    spaceAbility as any,
    spaceMemberRepo as any,
    pagePermissionRepo as any,
  );
  return { service, expertiseRepo };
}

describe('ExpertiseService.vote', () => {
  it('records a helpful vote and answers the new totals', async () => {
    const { service, expertiseRepo } = makeService({ insight: insight() });
    const res = await service.vote({ insightId: 'i-1', vote: 'helpful' }, user);
    expect(expertiseRepo.setVote).toHaveBeenCalledWith('i-1', 'u-1', 'helpful');
    expect(res).toEqual({
      insightId: 'i-1',
      myVote: 'helpful',
      helpfulCount: 4,
      notHelpfulCount: 1,
    });
  });

  it('withdraws a vote with null', async () => {
    const { service, expertiseRepo } = makeService({ insight: insight() });
    await service.vote({ insightId: 'i-1', vote: null }, user);
    expect(expertiseRepo.setVote).toHaveBeenCalledWith('i-1', 'u-1', null);
  });

  it('refuses to rate a draft or a retired insight', async () => {
    for (const status of ['draft', 'retired']) {
      const { service, expertiseRepo } = makeService({ insight: insight({ status }) });
      await expect(
        service.vote({ insightId: 'i-1', vote: 'helpful' }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(expertiseRepo.setVote).not.toHaveBeenCalled();
    }
  });

  it('hides insights of spaces the reader cannot read', async () => {
    const { service } = makeService({ insight: insight(), canRead: false });
    await expect(
      service.vote({ insightId: 'i-1', vote: 'helpful' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides insights of a restricted page', async () => {
    const { service, expertiseRepo } = makeService({
      insight: insight(),
      openPages: [],
    });
    await expect(
      service.vote({ insightId: 'i-1', vote: 'not_helpful' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(expertiseRepo.setVote).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown insight', async () => {
    const { service } = makeService({ insight: undefined });
    await expect(
      service.vote({ insightId: 'i-x', vote: 'helpful' }, user),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/** Compiles real PostgreSQL and records it; answers every query with `rows`. */
function recordingDb(rows: any[]) {
  const queries: CompiledQuery[] = [];
  const connection = {
    executeQuery: async (q: CompiledQuery) => {
      queries.push(q);
      return { rows } as any;
    },
    streamQuery: async function* () {
      /* unused */
    },
  };
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => ({
        init: async () => undefined,
        destroy: async () => undefined,
        acquireConnection: async () => connection,
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

describe('ExpertiseRepo.setVote', () => {
  it('upserts one vote per person, then recounts both totals from the votes', async () => {
    const { db, queries } = recordingDb([{ helpful: '3', notHelpful: '1' }]);
    const repo = new ExpertiseRepo(db as any);

    const counts = await repo.setVote('i-1', 'u-1', 'helpful');

    expect(counts).toEqual({ helpfulCount: 3, notHelpfulCount: 1 });
    const [upsert, recount, update] = queries.map((q) => q.sql);
    expect(upsert).toContain('insert into "expert_insight_votes"');
    expect(upsert).toContain('on conflict ("insight_id", "user_id") do update set "vote"');
    expect(recount).toContain("count(*) filter (where vote = 'helpful')");
    expect(recount).toContain('from "expert_insight_votes"');
    expect(update).toContain('update "expert_insights" set "helpful_count" = $1, "not_helpful_count" = $2');
    expect(queries[2].parameters.slice(0, 2)).toEqual([3, 1]);
  });

  it('deletes the vote when it is withdrawn', async () => {
    const { db, queries } = recordingDb([{ helpful: '0', notHelpful: '0' }]);
    const repo = new ExpertiseRepo(db as any);
    await repo.setVote('i-1', 'u-1', null);
    expect(queries[0].sql).toContain('delete from "expert_insight_votes"');
  });

  it('builds the directory query for published insights and manageable spaces', async () => {
    const { db, queries } = recordingDb([]);
    const repo = new ExpertiseRepo(db as any);
    await repo.search({
      workspaceId: 'ws-1',
      spaceIds: ['s-1', 's-2'],
      manageableSpaceIds: ['s-2'],
      query: 'paie',
      limit: 20,
    });
    const { sql } = queries[0];
    expect(sql).toContain('"i"."deleted_at" is null');
    expect(sql).toContain('"p"."deleted_at" is null');
    expect(sql).toMatch(/"i"\."status" = \$\d+ or "p"\."space_id" in \(\$\d+\)/);
    expect(sql).toContain("plainto_tsquery('simple'");
    expect(sql).toContain('order by i.published_at desc nulls last');
  });
});
