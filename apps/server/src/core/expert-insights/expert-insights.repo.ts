import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import {
  ExpertInsightStatus,
  ExpertInsightType,
} from '../../database/types/expert-insights.types';

export interface InsightRow {
  id: string;
  workspaceId: string;
  spaceId: string;
  pageId: string;
  insightType: ExpertInsightType;
  status: ExpertInsightStatus;
  title: string;
  body: string;
  createdBy: string | null;
  publishedBy: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  retiredAt: Date | null;
  spanAnchor: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateInsightInput {
  workspaceId: string;
  spaceId: string;
  pageId: string;
  insightType: ExpertInsightType;
  title: string;
  body: string;
  createdBy: string;
  expiresAt?: Date | null;
  spanAnchor?: unknown;
}

export interface UpdateInsightInput {
  insightType?: ExpertInsightType;
  title?: string;
  body?: string;
  expiresAt?: Date | null;
  spanAnchor?: unknown;
}

@Injectable()
export class ExpertInsightsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(input: CreateInsightInput): Promise<InsightRow> {
    return (this.db as any)
      .insertInto('expertInsights')
      .values({
        workspaceId: input.workspaceId,
        spaceId: input.spaceId,
        pageId: input.pageId,
        insightType: input.insightType,
        title: input.title,
        body: input.body,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
        spanAnchor: input.spanAnchor
          ? sql`${JSON.stringify(input.spanAnchor)}::jsonb`
          : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async findById(id: string): Promise<InsightRow | undefined> {
    return (this.db as any)
      .selectFrom('expertInsights')
      .selectAll()
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findByPage(
    pageId: string,
    status?: ExpertInsightStatus,
  ): Promise<InsightRow[]> {
    let query = (this.db as any)
      .selectFrom('expertInsights')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc');

    if (status) {
      query = query.where('status', '=', status);
    }

    return query.execute();
  }

  async update(id: string, input: UpdateInsightInput): Promise<InsightRow> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.insightType !== undefined) updates.insightType = input.insightType;
    if (input.title !== undefined) updates.title = input.title;
    if (input.body !== undefined) updates.body = input.body;
    if ('expiresAt' in input) updates.expiresAt = input.expiresAt ?? null;
    if ('spanAnchor' in input) {
      updates.spanAnchor = input.spanAnchor
        ? sql`${JSON.stringify(input.spanAnchor)}::jsonb`
        : null;
    }

    return (this.db as any)
      .updateTable('expertInsights')
      .set(updates)
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async publish(id: string, publishedBy: string): Promise<InsightRow> {
    return (this.db as any)
      .updateTable('expertInsights')
      .set({
        status: 'published',
        publishedBy,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'draft')
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async retire(id: string): Promise<InsightRow> {
    return (this.db as any)
      .updateTable('expertInsights')
      .set({
        status: 'retired',
        retiredAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('status', '=', 'published')
      .where('deletedAt', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async softDelete(id: string): Promise<void> {
    await (this.db as any)
      .updateTable('expertInsights')
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where('id', '=', id)
      .where('deletedAt', 'is', null)
      .execute();
  }

  /** Retire all published insights whose expiresAt is in the past. */
  async retireExpired(): Promise<string[]> {
    const rows: { id: string }[] = await (this.db as any)
      .updateTable('expertInsights')
      .set({ status: 'retired', retiredAt: new Date(), updatedAt: new Date() })
      .where('status', '=', 'published')
      .where('expiresAt', 'is not', null)
      .where('expiresAt', '<=', new Date())
      .where('deletedAt', 'is', null)
      .returning('id')
      .execute();

    return rows.map((r) => r.id);
  }
}
