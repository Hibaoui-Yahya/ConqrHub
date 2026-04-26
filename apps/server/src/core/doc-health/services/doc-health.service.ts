import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  HealthScoreResponse,
  SignalBreakdown,
  SpaceScoreSummary,
  WorkspaceHealthResponse,
} from '../dto/doc-health.dto';
import {
  PageScoringInput,
  ScoredPage,
  ScoringService,
} from './scoring.service';

type PageHealthRow = {
  id: string;
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string;
  spaceIsCritical: boolean;
  updatedAt: Date;
  textContent: string | null;
  hasActiveOwner: boolean;
  hasVerificationRecord: boolean;
  verificationStatus: string | null;
  verificationExpiresAt: Date | null;
};

@Injectable()
export class DocHealthService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly scoring: ScoringService,
  ) {}

  async getWorkspaceHealth(
    workspaceId: string,
  ): Promise<WorkspaceHealthResponse> {
    const rows = await this.fetchPageRows({ workspaceId });
    return this.buildWorkspaceResponse(rows);
  }

  async getSpaceHealth(
    workspaceId: string,
    spaceId: string,
  ): Promise<HealthScoreResponse> {
    const rows = await this.fetchPageRows({ workspaceId, spaceId });
    return this.buildScoreResponse(rows);
  }

  private buildScoreResponse(rows: PageHealthRow[]): HealthScoreResponse {
    const scored = rows.map((row) => this.scoring.scorePage(this.toInput(row)));
    const rollup = this.scoring.rollup(scored);
    return {
      score: rollup.score,
      pageCount: rows.length,
      scoredPageCount: scored.length,
      signals: rollup.signals,
      insufficientData: rollup.insufficientData,
    };
  }

  private buildWorkspaceResponse(
    rows: PageHealthRow[],
  ): WorkspaceHealthResponse {
    const bySpace = new Map<
      string,
      { rows: PageHealthRow[]; scored: ScoredPage[] }
    >();
    const allScored: ScoredPage[] = [];

    for (const row of rows) {
      const scored = this.scoring.scorePage(this.toInput(row));
      allScored.push(scored);
      let bucket = bySpace.get(row.spaceId);
      if (!bucket) {
        bucket = { rows: [], scored: [] };
        bySpace.set(row.spaceId, bucket);
      }
      bucket.rows.push(row);
      bucket.scored.push(scored);
    }

    const overall = this.scoring.rollup(allScored);

    const spaces: SpaceScoreSummary[] = Array.from(bySpace.entries())
      .map(([spaceId, bucket]) => {
        const rollup = this.scoring.rollup(bucket.scored);
        const first = bucket.rows[0];
        return {
          spaceId,
          spaceName: first.spaceName,
          spaceSlug: first.spaceSlug,
          isCritical: first.spaceIsCritical,
          score: rollup.score,
          pageCount: bucket.rows.length,
          insufficientData: rollup.insufficientData,
        };
      })
      .sort((a, b) => {
        if (a.score === null && b.score === null) return 0;
        if (a.score === null) return 1;
        if (b.score === null) return -1;
        return a.score - b.score;
      });

    return {
      score: overall.score,
      pageCount: rows.length,
      scoredPageCount: allScored.length,
      signals: overall.signals,
      insufficientData: overall.insufficientData,
      spaces,
    };
  }

  private toInput(row: PageHealthRow): PageScoringInput {
    return {
      updatedAt: row.updatedAt,
      hasActiveOwner: row.hasActiveOwner,
      isCritical: row.spaceIsCritical,
      hasVerificationRecord: row.hasVerificationRecord,
      verificationStatus: row.verificationStatus,
      verificationExpiresAt: row.verificationExpiresAt,
      wordCount: this.scoring.countWords(row.textContent),
    };
  }

  async fetchPageRows(args: {
    workspaceId: string;
    spaceId?: string;
  }): Promise<PageHealthRow[]> {
    let query = this.db
      .selectFrom('pages as p')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .leftJoin('users as owner', 'owner.id', 'p.ownerId')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
      .select([
        'p.id as id',
        'p.spaceId as spaceId',
        's.name as spaceName',
        's.slug as spaceSlug',
        's.isCritical as spaceIsCritical',
        'p.updatedAt as updatedAt',
        'p.textContent as textContent',
        'pv.status as verificationStatus',
        'pv.expiresAt as verificationExpiresAt',
      ])
      .select((eb) =>
        sql<boolean>`(
          ${eb.ref('p.ownerId')} IS NOT NULL
          AND ${eb.ref('owner.deactivatedAt')} IS NULL
          AND ${eb.ref('owner.deletedAt')} IS NULL
        )`.as('hasActiveOwner'),
      )
      .select((eb) =>
        sql<boolean>`${eb.ref('pv.id')} IS NOT NULL`.as('hasVerificationRecord'),
      )
      .where('p.workspaceId', '=', args.workspaceId)
      .where('p.deletedAt', 'is', null)
      .where('s.deletedAt', 'is', null);

    if (args.spaceId) {
      query = query.where('p.spaceId', '=', args.spaceId);
    }

    return (await query.execute()) as PageHealthRow[];
  }
}
