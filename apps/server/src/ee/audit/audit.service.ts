import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ClsService } from 'nestjs-cls';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  IAuditService,
  AuditLogContext,
} from '../../integrations/audit/audit.service';
import {
  AuditLogPayload,
  ActorType,
} from '../../common/events/audit-events';
import {
  AuditContext,
  AUDIT_CONTEXT_KEY,
} from '../../common/middlewares/audit-context.middleware';

const DEFAULT_RETENTION_DAYS = 90;

@Injectable()
export class AuditService implements IAuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly cls: ClsService,
  ) {}

  setActorId(actorId: string): void {
    const ctx: any = this.cls.get(AUDIT_CONTEXT_KEY);
    if (ctx) {
      ctx.actorId = actorId;
      this.cls.set(AUDIT_CONTEXT_KEY, ctx);
    }
  }

  setActorType(actorType: ActorType): void {
    const ctx: any = this.cls.get(AUDIT_CONTEXT_KEY);
    if (ctx) {
      ctx.actorType = actorType;
      this.cls.set(AUDIT_CONTEXT_KEY, ctx);
    }
  }

  log(payload: AuditLogPayload): void {
    const ctx: any = this.cls.get(AUDIT_CONTEXT_KEY);
    this.persist(payload, ctx ?? undefined).catch((err) =>
      this.logger.error('Failed to persist audit log', err),
    );
  }

  logWithContext(payload: AuditLogPayload, context: AuditLogContext): void {
    this.persist(payload, context).catch((err) =>
      this.logger.error('Failed to persist audit log', err),
    );
  }

  logBatchWithContext(payloads: AuditLogPayload[], context: AuditLogContext): void {
    Promise.all(payloads.map((p) => this.persist(p, context))).catch((err) =>
      this.logger.error('Failed to persist audit log batch', err),
    );
  }

  async updateRetention(workspaceId: string, retentionDays: number): Promise<void> {
    await this.db
      .updateTable('workspaces')
      .set({ auditRetentionDays: retentionDays })
      .where('id', '=', workspaceId)
      .execute();
  }

  async getRetention(workspaceId: string): Promise<{ retentionDays: number }> {
    const ws = await this.db
      .selectFrom('workspaces')
      .select('auditRetentionDays')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    return {
      retentionDays: ws?.auditRetentionDays ?? DEFAULT_RETENTION_DAYS,
    };
  }

  async getLogs(
    workspaceId: string,
    opts: {
      event?: string;
      resourceType?: string;
      actorId?: string;
      spaceId?: string;
      startDate?: string;
      endDate?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = opts.limit ?? 50;

    let query = this.db
      .selectFrom('audit')
      .selectAll()
      .where('workspaceId', '=', workspaceId);

    if (opts.event) query = query.where('event', '=', opts.event);
    if (opts.resourceType) query = query.where('resourceType', '=', opts.resourceType);
    if (opts.actorId) query = query.where('actorId', '=', opts.actorId);
    if (opts.spaceId) query = query.where('spaceId', '=', opts.spaceId);
    if (opts.startDate) query = query.where('createdAt', '>=', new Date(opts.startDate));
    if (opts.endDate) query = query.where('createdAt', '<=', new Date(opts.endDate));
    if (opts.cursor) query = query.where('id', '<', opts.cursor);

    query = query.orderBy('id', 'desc').limit(limit + 1);

    const rows = await query.execute();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const actorIds = [...new Set(items.map((r) => r.actorId).filter(Boolean))];
    const users = actorIds.length > 0
      ? await this.db
          .selectFrom('users')
          .select(['id', 'name', 'email', 'avatarUrl'])
          .where('id', 'in', actorIds as string[])
          .execute()
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const result = items.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      actorId: row.actorId,
      actorType: row.actorType,
      event: row.event,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      spaceId: row.spaceId,
      changes: row.changes,
      metadata: row.metadata,
      ipAddress: row.ipAddress,
      createdAt: (row.createdAt as Date).toISOString(),
      actor: row.actorId ? userMap.get(row.actorId) ?? null : null,
    }));

    return {
      items: result,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  private async persist(
    payload: AuditLogPayload,
    context?: AuditLogContext,
  ): Promise<void> {
    try {
      const workspaceId = context?.workspaceId ?? '';
      if (!workspaceId) return;

      await this.db
        .insertInto('audit')
        .values({
          workspaceId,
          actorId: context?.actorId ?? null,
          actorType: context?.actorType ?? 'user',
          event: payload.event,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId ?? null,
          spaceId: payload.spaceId ?? null,
          changes: payload.changes ? JSON.stringify(payload.changes) : null,
          metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
          ipAddress: context?.ipAddress ?? null,
        })
        .execute();
    } catch (err) {
      this.logger.error('Failed to write audit log', err);
    }
  }
}
