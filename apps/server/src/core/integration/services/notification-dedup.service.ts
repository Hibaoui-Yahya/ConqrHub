import { Injectable } from '@nestjs/common';
import { IntegrationEventRepo } from '@docmost/db/repos/integration/integration-event.repo';
import { IntegrationEvent } from '@docmost/db/types/entity.types';
import { EventType } from '../domain/event-envelope';

export interface DedupedNotification {
  correlationId: string;
  /** The single user-facing outcome this chain represents. */
  outcome: string;
  subject: string;
  actorId: string | null;
  /** How many raw events collapsed into this one notification. */
  collapsedEventCount: number;
  at: string;
}

// Priority for choosing the representative outcome of a correlation chain:
// the meaningful user outcome wins over the mechanical follow-ups it triggers.
const OUTCOME_PRIORITY: Record<string, number> = {
  [EventType.RelationshipCreated]: 100,
  [EventType.MappingChanged]: 90,
  [EventType.PlaneWorkItemDeleted]: 80,
  [EventType.PlaneWorkItemUpdated]: 70,
  [EventType.RelationshipRemoved]: 60,
};

const OUTCOME_LABEL: Record<string, string> = {
  [EventType.RelationshipCreated]: 'linked',
  [EventType.RelationshipRemoved]: 'unlinked',
  [EventType.MappingChanged]: 'mapping-changed',
  [EventType.PlaneWorkItemUpdated]: 'work-updated',
  [EventType.PlaneWorkItemDeleted]: 'work-deleted',
};

/**
 * Deduplicates cross-product notification chains (blueprint §5.3C, §5.3D).
 *
 * A single user action fans out into several correlated events (e.g. "link
 * created" + "backlink created"). We group by correlation id and emit ONE
 * notification per chain, keyed by outcome and context — not one per raw event.
 */
@Injectable()
export class NotificationDedupService {
  constructor(private readonly events: IntegrationEventRepo) {}

  /** Pure grouping — collapse a set of events into deduped notifications. */
  dedupe(events: IntegrationEvent[]): DedupedNotification[] {
    const byCorrelation = new Map<string, IntegrationEvent[]>();
    for (const e of events) {
      const key = e.correlationId;
      if (!byCorrelation.has(key)) byCorrelation.set(key, []);
      byCorrelation.get(key)!.push(e);
    }

    const out: DedupedNotification[] = [];
    for (const [correlationId, group] of byCorrelation) {
      const representative = group.reduce((best, e) =>
        (OUTCOME_PRIORITY[e.type] ?? 0) > (OUTCOME_PRIORITY[best.type] ?? 0)
          ? e
          : best,
      );
      out.push({
        correlationId,
        outcome: OUTCOME_LABEL[representative.type] ?? representative.type,
        subject: representative.subject,
        actorId: representative.actorId,
        collapsedEventCount: group.length,
        at: new Date(
          representative.createdAt as unknown as string,
        ).toISOString(),
      });
    }
    // Newest first.
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }

  /**
   * Recent deduped notifications for a workspace, newest first (the bell's
   * cross-product "Suite" feed, §5.3C). Cap applies AFTER dedup so the user
   * sees `limit` outcomes, not `limit` raw events.
   */
  async recentForWorkspace(
    workspaceId: string,
    limit = 20,
  ): Promise<DedupedNotification[]> {
    const events = await this.events.findRecentByWorkspace(workspaceId, 200);
    return this.dedupe(events).slice(0, Math.max(1, limit));
  }

  /** Deduped notifications for a single correlation chain (from the outbox). */
  async forCorrelation(
    workspaceId: string,
    correlationId: string,
  ): Promise<DedupedNotification[]> {
    const events = await this.events.findByCorrelation(
      workspaceId,
      correlationId,
    );
    return this.dedupe(events);
  }
}
