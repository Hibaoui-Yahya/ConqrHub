import { Injectable, Logger } from '@nestjs/common';
import { ProjectSpaceMappingRepo } from '@docmost/db/repos/integration/project-space-mapping.repo';
import { IntegrationEventService } from './integration-event.service';
import { EventType } from '../domain/event-envelope';
import { buildUrn } from '../domain/urn.util';

export interface LifecycleSuggestion {
  suggestionsEmitted: number;
}

/**
 * Lifecycle automation (blueprint §6.3, §6.4). When a Plane cycle/module
 * completes, we SUGGEST a retrospective/review document in the mapped Hub space
 * — we never auto-create silently (§6.3: "suggest an update... require a human
 * to approve"). The suggestion is an event the UI surfaces as a prompt with a
 * one-click "draft from template" action.
 */
@Injectable()
export class LifecycleAutomationService {
  private readonly logger = new Logger(LifecycleAutomationService.name);

  constructor(
    private readonly mappings: ProjectSpaceMappingRepo,
    private readonly events: IntegrationEventService,
  ) {}

  /** Cycle completed → suggest a retrospective. Module completed → review. */
  async onContainerCompleted(params: {
    kind: 'cycle' | 'module';
    projectId: string;
    id: string;
    name?: string;
  }): Promise<LifecycleSuggestion> {
    if (!params.projectId || !params.id) return { suggestionsEmitted: 0 };

    const mapped = await this.mappings.findPrimaryByProjectAnyWorkspace(
      params.projectId,
    );
    const templateKind =
      params.kind === 'cycle' ? 'retrospective' : 'review';

    let emitted = 0;
    for (const m of mapped) {
      await this.events.record({
        workspaceId: m.workspaceId,
        type: EventType.RetroSuggested,
        source: 'plane-adapter',
        subject: buildUrn('plane', params.kind, params.id),
        data: {
          templateKind,
          planeProjectId: params.projectId,
          spaceId: m.spaceId,
          containerName: params.name ?? null,
          requiresHumanApproval: true,
        },
      });
      emitted++;
    }
    this.logger.log(
      `Suggested ${templateKind} for ${params.kind} ${params.id} in ${emitted} space(s)`,
    );
    return { suggestionsEmitted: emitted };
  }
}
