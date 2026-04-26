import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/notification.constants';

const ALERT_DEDUPE_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_THRESHOLD = 0;
const MAX_THRESHOLD = 100;

export type AlertSubscription = {
  id: string;
  userId: string;
  workspaceId: string;
  spaceId: string | null;
  threshold: number;
  lastFiredAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class HealthAlertsService {
  private readonly logger = new Logger(HealthAlertsService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
  ) {}

  async listForUser(
    userId: string,
    workspaceId: string,
  ): Promise<AlertSubscription[]> {
    const rows = await this.db
      .selectFrom('docHealthAlertSubscriptions')
      .selectAll()
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'asc')
      .execute();

    return rows.map(toSubscription);
  }

  async subscribe(args: {
    userId: string;
    workspaceId: string;
    spaceId?: string | null;
    threshold: number;
  }): Promise<AlertSubscription> {
    if (
      !Number.isFinite(args.threshold) ||
      args.threshold < MIN_THRESHOLD ||
      args.threshold > MAX_THRESHOLD
    ) {
      throw new BadRequestException(
        `threshold must be between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}`,
      );
    }

    const spaceId = args.spaceId ?? null;

    // Validate space belongs to workspace if provided
    if (spaceId) {
      const space = await this.db
        .selectFrom('spaces')
        .select('id')
        .where('id', '=', spaceId)
        .where('workspaceId', '=', args.workspaceId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!space) throw new NotFoundException('Space not found');
    }

    // Upsert: same user + workspace + spaceId scope reuses the row.
    const existing = await this.findBy({
      userId: args.userId,
      workspaceId: args.workspaceId,
      spaceId,
    });

    if (existing) {
      const updated = await this.db
        .updateTable('docHealthAlertSubscriptions')
        .set({ threshold: args.threshold, updatedAt: new Date() })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toSubscription(updated);
    }

    const inserted = await this.db
      .insertInto('docHealthAlertSubscriptions')
      .values({
        userId: args.userId,
        workspaceId: args.workspaceId,
        spaceId,
        threshold: args.threshold,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSubscription(inserted);
  }

  async unsubscribe(args: {
    userId: string;
    workspaceId: string;
    subscriptionId: string;
  }): Promise<void> {
    const row = await this.db
      .selectFrom('docHealthAlertSubscriptions')
      .select(['id', 'userId', 'workspaceId'])
      .where('id', '=', args.subscriptionId)
      .executeTakeFirst();

    if (!row) throw new NotFoundException('Subscription not found');
    if (row.userId !== args.userId || row.workspaceId !== args.workspaceId) {
      throw new ForbiddenException();
    }

    await this.db
      .deleteFrom('docHealthAlertSubscriptions')
      .where('id', '=', args.subscriptionId)
      .execute();
  }

  /**
   * Evaluate every subscription for one workspace against the latest snapshot
   * row for its scope. If the score is below threshold AND we haven't fired
   * within the dedupe window, create an in-app notification and stamp
   * lastFiredAt.
   */
  async evaluateForWorkspace(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<{ fired: number }> {
    const subs = await this.db
      .selectFrom('docHealthAlertSubscriptions')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .execute();

    if (subs.length === 0) return { fired: 0 };

    // Pull the latest snapshot per scope in one round-trip
    const subspaceIds = subs
      .map((s) => s.spaceId)
      .filter((id): id is string => id !== null);

    const latestRows = await this.db
      .selectFrom('docHealthSnapshots as s')
      .select(['s.spaceId', 's.score', 's.capturedAt'])
      .where('s.workspaceId', '=', workspaceId)
      .where((eb) =>
        eb.or([
          eb('s.spaceId', 'is', null),
          subspaceIds.length > 0
            ? eb('s.spaceId', 'in', subspaceIds)
            : eb.lit(false),
        ]),
      )
      .where(
        's.capturedAt',
        '=',
        sql<Date>`(
          SELECT max(captured_at)
          FROM doc_health_snapshots inner_s
          WHERE inner_s.workspace_id = s.workspace_id
            AND inner_s.space_id IS NOT DISTINCT FROM s.space_id
        )`,
      )
      .execute();

    const latestByScope = new Map<string, { score: number | null }>();
    for (const r of latestRows) {
      latestByScope.set(scopeKey(r.spaceId), { score: r.score });
    }

    let fired = 0;
    const dedupeFloor = new Date(now.getTime() - ALERT_DEDUPE_MS);

    for (const sub of subs) {
      const latest = latestByScope.get(scopeKey(sub.spaceId));
      if (!latest || latest.score === null) continue;
      if (latest.score >= sub.threshold) continue;

      const lastFired = sub.lastFiredAt
        ? new Date(sub.lastFiredAt)
        : null;
      if (lastFired && lastFired >= dedupeFloor) continue;

      try {
        await this.fire({
          userId: sub.userId,
          workspaceId: sub.workspaceId,
          spaceId: sub.spaceId,
          score: latest.score,
          threshold: sub.threshold,
        });
        await this.db
          .updateTable('docHealthAlertSubscriptions')
          .set({ lastFiredAt: now, updatedAt: now })
          .where('id', '=', sub.id)
          .execute();
        fired += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to fire doc-health alert ${sub.id}: ${message}`,
        );
      }
    }

    return { fired };
  }

  private async fire(args: {
    userId: string;
    workspaceId: string;
    spaceId: string | null;
    score: number;
    threshold: number;
  }) {
    await this.notificationService.create({
      userId: args.userId,
      workspaceId: args.workspaceId,
      type: NotificationType.DOC_HEALTH_DROPPED,
      spaceId: args.spaceId,
      data: {
        score: args.score,
        threshold: args.threshold,
        scope: args.spaceId ? 'space' : 'workspace',
      },
    });
  }

  private async findBy(args: {
    userId: string;
    workspaceId: string;
    spaceId: string | null;
  }) {
    let query = this.db
      .selectFrom('docHealthAlertSubscriptions')
      .selectAll()
      .where('userId', '=', args.userId)
      .where('workspaceId', '=', args.workspaceId);

    query =
      args.spaceId === null
        ? query.where('spaceId', 'is', null)
        : query.where('spaceId', '=', args.spaceId);

    return query.executeTakeFirst();
  }
}

function scopeKey(spaceId: string | null): string {
  return spaceId ?? '__workspace__';
}

function toSubscription(row: any): AlertSubscription {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    spaceId: row.spaceId,
    threshold: row.threshold,
    lastFiredAt: row.lastFiredAt ? new Date(row.lastFiredAt) : null,
    createdAt: new Date(row.createdAt),
  };
}
