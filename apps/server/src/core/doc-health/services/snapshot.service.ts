import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { DocHealthService } from './doc-health.service';
import { SignalBreakdown } from '../dto/doc-health.dto';

export const TREND_MAX_DAYS = 365;
export const SNAPSHOT_RETENTION_DAYS = 365;

export type TrendPoint = {
  capturedAt: string;
  score: number | null;
};

@Injectable()
export class HealthSnapshotService {
  private readonly logger = new Logger(HealthSnapshotService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly docHealth: DocHealthService,
  ) {}

  /**
   * Snapshot one workspace's score (one workspace-level row + one row per space).
   * Idempotent within a UTC day: re-running the same day overwrites that day's rows.
   */
  async captureWorkspace(
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const capturedAt = startOfUtcDay(now);
    const snapshot = await this.docHealth.getWorkspaceHealth(workspaceId);

    await this.db.transaction().execute(async (trx) => {
      // Workspace-level row (space_id IS NULL)
      await trx
        .deleteFrom('docHealthSnapshots')
        .where('workspaceId', '=', workspaceId)
        .where('spaceId', 'is', null)
        .where('capturedAt', '=', capturedAt)
        .execute();

      await trx
        .insertInto('docHealthSnapshots')
        .values({
          workspaceId,
          spaceId: null,
          capturedAt,
          score: snapshot.score,
          signals: signalsToJson(snapshot.signals),
          pageCount: snapshot.pageCount,
          scoredPageCount: snapshot.scoredPageCount,
        } as any)
        .execute();

      // Per-space rows
      if (snapshot.spaces.length === 0) return;

      await trx
        .deleteFrom('docHealthSnapshots')
        .where('workspaceId', '=', workspaceId)
        .where(
          'spaceId',
          'in',
          snapshot.spaces.map((s) => s.spaceId),
        )
        .where('capturedAt', '=', capturedAt)
        .execute();

      const spaceRows = await Promise.all(
        snapshot.spaces.map(async (space) => {
          const detail = await this.docHealth.getSpaceHealth(
            workspaceId,
            space.spaceId,
          );
          return {
            workspaceId,
            spaceId: space.spaceId,
            capturedAt,
            score: space.score,
            signals: signalsToJson(detail.signals),
            pageCount: space.pageCount,
            scoredPageCount: detail.scoredPageCount,
          };
        }),
      );

      await trx
        .insertInto('docHealthSnapshots')
        .values(spaceRows as any)
        .execute();
    });
  }

  /**
   * Iterate every workspace and snapshot it. Errors on individual workspaces
   * are logged but do not stop the run. Returns the IDs of workspaces that
   * were captured successfully so the caller can fan out follow-up work
   * (e.g., evaluating doc-health alert subscriptions).
   */
  async captureAll(now: Date = new Date()): Promise<{
    captured: number;
    failed: number;
    workspaceIds: string[];
  }> {
    const workspaces = await this.db
      .selectFrom('workspaces')
      .select('id')
      .where('deletedAt', 'is', null)
      .execute();

    let captured = 0;
    let failed = 0;
    const workspaceIds: string[] = [];
    for (const w of workspaces) {
      try {
        await this.captureWorkspace(w.id, now);
        captured += 1;
        workspaceIds.push(w.id);
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to snapshot workspace ${w.id}: ${message}`,
        );
      }
    }
    return { captured, failed, workspaceIds };
  }

  async getTrend(args: {
    workspaceId: string;
    spaceId?: string | null;
    days: number;
  }): Promise<TrendPoint[]> {
    const days = clampDays(args.days);
    const since = new Date(Date.now() - days * 86_400_000);

    let query = this.db
      .selectFrom('docHealthSnapshots')
      .select(['capturedAt', 'score'])
      .where('workspaceId', '=', args.workspaceId)
      .where('capturedAt', '>=', since);

    query = args.spaceId
      ? query.where('spaceId', '=', args.spaceId)
      : query.where('spaceId', 'is', null);

    const rows = await query.orderBy('capturedAt', 'asc').execute();

    return rows.map((r) => ({
      capturedAt:
        r.capturedAt instanceof Date
          ? r.capturedAt.toISOString()
          : new Date(r.capturedAt).toISOString(),
      score: r.score,
    }));
  }

  async pruneOlderThan(days: number = SNAPSHOT_RETENTION_DAYS): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await this.db
      .deleteFrom('docHealthSnapshots')
      .where('capturedAt', '<', cutoff)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}

function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

function clampDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 30;
  return Math.min(Math.floor(days), TREND_MAX_DAYS);
}

function signalsToJson(signals: SignalBreakdown) {
  // jsonb column — pass through Kysely's sql template so the typed insert
  // accepts our specific shape. The verification field is `number | null`.
  return sql`${JSON.stringify(signals)}::jsonb`;
}
