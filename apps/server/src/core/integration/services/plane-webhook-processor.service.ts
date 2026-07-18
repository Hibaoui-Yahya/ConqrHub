import { Injectable, Logger } from '@nestjs/common';
import { RelationshipRepo } from '@docmost/db/repos/integration/relationship.repo';
import { IntegrationEventService } from './integration-event.service';
import { LifecycleAutomationService } from './lifecycle-automation.service';
import { buildUrn } from '../domain/urn.util';
import { EventType } from '../domain/event-envelope';

export interface ParsedPlaneEvent {
  event?: string; // "issue", "cycle", ...
  action?: string; // "created" | "updated" | "deleted"
  data?: { id?: string; project?: string; [k: string]: unknown };
}

export interface ProcessResult {
  affectedWorkspaces: number;
  subject?: string;
}

/**
 * Translates a verified Plane webhook into refresh events for every workspace
 * that has linked the affected object (blueprint §8.4). Idempotent: re-running
 * for the same delivery only re-emits refresh signals, never mutating canonical
 * data. Cache invalidation / notification fan-out hang off the emitted event.
 */
@Injectable()
export class PlaneWebhookProcessorService {
  private readonly logger = new Logger(PlaneWebhookProcessorService.name);

  constructor(
    private readonly relationships: RelationshipRepo,
    private readonly events: IntegrationEventService,
    private readonly lifecycle: LifecycleAutomationService,
  ) {}

  parse(rawBody: Buffer | string | undefined): ParsedPlaneEvent | null {
    if (!rawBody) return null;
    try {
      return JSON.parse(rawBody.toString());
    } catch {
      return null;
    }
  }

  async process(
    payload: ParsedPlaneEvent | null,
    deliveryId: string,
  ): Promise<ProcessResult> {
    if (!payload?.data?.id) return { affectedWorkspaces: 0 };

    // Cycle/module completion → lifecycle suggestions (§6.3/§6.4).
    if (
      (payload.event === 'cycle' || payload.event === 'module') &&
      payload.action === 'completed'
    ) {
      const res = await this.lifecycle.onContainerCompleted({
        kind: payload.event,
        projectId: String(payload.data.project ?? ''),
        id: String(payload.data.id),
        name: (payload.data as any).name,
      });
      return {
        affectedWorkspaces: res.suggestionsEmitted,
        subject: buildUrn('plane', payload.event, String(payload.data.id)),
      };
    }

    // Only work-item (issue) events map to smart-object refreshes.
    if (payload.event !== 'issue') {
      return { affectedWorkspaces: 0 };
    }

    const subject = buildUrn('plane', 'work-item', payload.data.id);
    const affected = await this.relationships.findByUrnAnyWorkspace(subject);
    const workspaces = Array.from(
      new Set(affected.map((r) => r.workspaceId)),
    );

    const isDelete = payload.action === 'deleted';
    for (const workspaceId of workspaces) {
      await this.events.record({
        workspaceId,
        type: isDelete
          ? EventType.PlaneWorkItemDeleted
          : EventType.PlaneWorkItemUpdated,
        source: 'plane-adapter',
        subject,
        data: {
          action: payload.action ?? 'updated',
          deliveryId,
          projectId: payload.data.project ?? null,
        },
      });
    }

    this.logger.log(
      `Processed Plane ${payload.action} for ${subject}: notified ${workspaces.length} workspace(s)`,
    );
    return { affectedWorkspaces: workspaces.length, subject };
  }
}
