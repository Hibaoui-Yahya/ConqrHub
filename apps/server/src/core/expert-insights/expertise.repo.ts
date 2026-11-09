import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  ExpertInsightStatus,
  ExpertInsightVoteKind,
} from '../../database/types/expert-insights.types';
import { InsightRow } from './expert-insights.repo';

export interface InsightSearchRow extends InsightRow {
  pageTitle: string | null;
  pageSlugId: string;
  spaceName: string;
  spaceSlug: string;
}

/**
 * Queries behind the "Expertise" screen: the workspace-wide directory and
 * the helpful / not helpful votes. The tables are not in the generated DB
 * types (same as ExpertInsightsRepo), hence the untyped builder.
 */
@Injectable()
export class ExpertiseRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private get anyDb(): any {
    return this.db as any;
  }

  async search(opts: {
    workspaceId: string;
    spaceIds: string[];
    /** Spaces where drafts and retired insights may be listed too. */
    manageableSpaceIds: string[];
    status?: ExpertInsightStatus;
    query?: string;
    limit: number;
  }): Promise<InsightSearchRow[]> {
    if (opts.spaceIds.length === 0) return [];

    let q = this.anyDb
      .selectFrom('expertInsights as i')
      .innerJoin('pages as p', 'p.id', 'i.pageId')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .selectAll('i')
      .select([
        'p.title as pageTitle',
        'p.slugId as pageSlugId',
        's.name as spaceName',
        's.slug as spaceSlug',
      ])
      .where('i.workspaceId', '=', opts.workspaceId)
      .where('i.deletedAt', 'is', null)
      .where('p.deletedAt', 'is', null)
      .where('p.spaceId', 'in', opts.spaceIds);

    if (opts.status) {
      q = q.where('i.status', '=', opts.status);
    }

    // Published insights for every member; the other states only where the
    // reader may manage insights.
    q = q.where((eb: any) =>
      opts.manageableSpaceIds.length
        ? eb.or([
            eb('i.status', '=', 'published'),
            eb('p.spaceId', 'in', opts.manageableSpaceIds),
          ])
        : eb('i.status', '=', 'published'),
    );

    const needle = opts.query?.trim();
    if (needle) {
      const pattern = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      q = q.where((eb: any) =>
        eb.or([
          eb(sql`i.tsv`, '@@', sql`plainto_tsquery('simple', ${needle})`),
          eb('i.title', 'ilike', pattern),
          eb('i.authorName', 'ilike', pattern),
          eb('i.authorDepartment', 'ilike', pattern),
        ]),
      );
    }

    return q
      .orderBy(sql`i.published_at desc nulls last, i.created_at desc`)
      .limit(opts.limit)
      .execute();
  }

  async findVotes(
    userId: string,
    insightIds: string[],
  ): Promise<Record<string, ExpertInsightVoteKind>> {
    if (insightIds.length === 0) return {};
    const rows: { insightId: string; vote: ExpertInsightVoteKind }[] =
      await this.anyDb
        .selectFrom('expertInsightVotes')
        .select(['insightId', 'vote'])
        .where('userId', '=', userId)
        .where('insightId', 'in', insightIds)
        .execute();
    return Object.fromEntries(rows.map((r) => [r.insightId, r.vote]));
  }

  /**
   * Set (or clear, with null) one person's vote, then recount both totals
   * from the votes table in the same transaction so they cannot drift.
   */
  async setVote(
    insightId: string,
    userId: string,
    vote: ExpertInsightVoteKind | null,
  ): Promise<{ helpfulCount: number; notHelpfulCount: number }> {
    return this.anyDb.transaction().execute(async (trx: any) => {
      if (vote === null) {
        await trx
          .deleteFrom('expertInsightVotes')
          .where('insightId', '=', insightId)
          .where('userId', '=', userId)
          .execute();
      } else {
        await trx
          .insertInto('expertInsightVotes')
          .values({ insightId, userId, vote })
          .onConflict((oc: any) =>
            oc
              .columns(['insightId', 'userId'])
              .doUpdateSet({ vote, updatedAt: new Date() }),
          )
          .execute();
      }

      const counts = await trx
        .selectFrom('expertInsightVotes')
        .select([
          sql<number>`count(*) filter (where vote = 'helpful')`.as('helpful'),
          sql<number>`count(*) filter (where vote = 'not_helpful')`.as(
            'notHelpful',
          ),
        ])
        .where('insightId', '=', insightId)
        .executeTakeFirst();

      const helpfulCount = Number(counts?.helpful ?? 0);
      const notHelpfulCount = Number(counts?.notHelpful ?? 0);

      await trx
        .updateTable('expertInsights')
        .set({ helpfulCount, notHelpfulCount })
        .where('id', '=', insightId)
        .execute();

      return { helpfulCount, notHelpfulCount };
    });
  }
}
