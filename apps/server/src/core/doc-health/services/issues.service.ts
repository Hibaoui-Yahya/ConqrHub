import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  HealthIssueCategory,
  HealthIssueItem,
  HealthIssuesResponse,
} from '../dto/doc-health.dto';
import {
  CONTENT_MIN_WORDS,
  FRESHNESS_STALE_DAYS,
  ScoringService,
  VERIFICATION_STATUS_VERIFIED,
} from './scoring.service';

const OUTDATED_DAYS = 180;

type IssueRow = {
  id: string;
  slugId: string;
  title: string | null;
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string;
  updatedAt: Date;
  textContent: string | null;
  hasActiveOwner: boolean;
  hasVerificationRecord: boolean;
  spaceIsCritical: boolean;
  verificationStatus: string | null;
  verificationExpiresAt: Date | null;
};

@Injectable()
export class HealthIssuesService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly scoring: ScoringService,
  ) {}

  async listIssues(args: {
    workspaceId: string;
    category: HealthIssueCategory;
    spaceId?: string;
    page: number;
    limit: number;
  }): Promise<HealthIssuesResponse> {
    const offset = (args.page - 1) * args.limit;
    const fetchLimit = args.limit + 1;

    const rows = await this.queryByCategory({
      workspaceId: args.workspaceId,
      category: args.category,
      spaceId: args.spaceId,
      limit: fetchLimit,
      offset,
    });

    const hasMore = rows.length > args.limit;
    const trimmed = hasMore ? rows.slice(0, args.limit) : rows;

    return {
      items: trimmed.map((row) => this.toItem(row, args.category)),
      page: args.page,
      limit: args.limit,
      hasMore,
    };
  }

  private toItem(row: IssueRow, category: HealthIssueCategory): HealthIssueItem {
    let detail = '';
    let severity: 'low' | 'medium' | 'high' = 'medium';

    switch (category) {
      case HealthIssueCategory.Outdated: {
        const ageDays = Math.floor(
          (Date.now() - new Date(row.updatedAt).getTime()) / 86_400_000,
        );
        detail = `Last updated ${ageDays} days ago`;
        severity = ageDays >= FRESHNESS_STALE_DAYS ? 'high' : 'medium';
        break;
      }
      case HealthIssueCategory.MissingOwner: {
        detail = 'No active owner assigned';
        severity = row.spaceIsCritical ? 'high' : 'medium';
        break;
      }
      case HealthIssueCategory.UnverifiedCritical: {
        if (row.verificationStatus === 'expiring') {
          detail = 'Verification expiring soon';
          severity = 'medium';
        } else if (
          row.verificationExpiresAt &&
          new Date(row.verificationExpiresAt).getTime() <= Date.now()
        ) {
          detail = 'Verification expired';
          severity = 'high';
        } else {
          detail = 'Critical page is not verified';
          severity = 'high';
        }
        break;
      }
      case HealthIssueCategory.WeakContent: {
        const words = this.scoring.countWords(row.textContent);
        detail = `Only ${words} words`;
        severity = words === 0 ? 'high' : 'low';
        break;
      }
    }

    return {
      pageId: row.id,
      pageSlugId: row.slugId,
      pageTitle: row.title,
      spaceId: row.spaceId,
      spaceName: row.spaceName,
      spaceSlug: row.spaceSlug,
      category,
      severity,
      detail,
    };
  }

  private async queryByCategory(args: {
    workspaceId: string;
    category: HealthIssueCategory;
    spaceId?: string;
    limit: number;
    offset: number;
  }): Promise<IssueRow[]> {
    let query = this.db
      .selectFrom('pages as p')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .leftJoin('users as owner', 'owner.id', 'p.ownerId')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
      .select([
        'p.id as id',
        'p.slugId as slugId',
        'p.title as title',
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

    const outdatedCutoff = new Date(
      Date.now() - OUTDATED_DAYS * 86_400_000,
    );

    switch (args.category) {
      case HealthIssueCategory.Outdated: {
        query = query
          .where('p.updatedAt', '<', outdatedCutoff)
          .orderBy('p.updatedAt', 'asc');
        break;
      }
      case HealthIssueCategory.MissingOwner: {
        query = query
          .where((eb) =>
            eb.or([
              eb('p.ownerId', 'is', null),
              eb('owner.deactivatedAt', 'is not', null),
              eb('owner.deletedAt', 'is not', null),
            ]),
          )
          .orderBy('s.isCritical', 'desc')
          .orderBy('p.updatedAt', 'desc');
        break;
      }
      case HealthIssueCategory.UnverifiedCritical: {
        query = query
          .where((eb) =>
            eb.or([
              eb('s.isCritical', '=', true),
              eb('pv.id', 'is not', null),
            ]),
          )
          .where((eb) =>
            eb.or([
              eb('pv.status', 'is', null),
              eb('pv.status', '!=', VERIFICATION_STATUS_VERIFIED),
              eb('pv.expiresAt', '<=', new Date()),
            ]),
          )
          .orderBy('p.updatedAt', 'desc');
        break;
      }
      case HealthIssueCategory.WeakContent: {
        query = query
          .where((eb) =>
            eb.or([
              eb('p.textContent', 'is', null),
              sql<boolean>`coalesce(array_length(regexp_split_to_array(trim(${eb.ref('p.textContent')}), '\\s+'), 1), 0) < ${CONTENT_MIN_WORDS}`,
            ]),
          )
          .orderBy('p.updatedAt', 'desc');
        break;
      }
    }

    return (await query
      .limit(args.limit)
      .offset(args.offset)
      .execute()) as IssueRow[];
  }
}
