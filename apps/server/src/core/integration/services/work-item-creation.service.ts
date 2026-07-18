import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlaneClientService } from './plane-client.service';
import { RelationshipService } from './relationship.service';
import { DelegatedTokenService } from './delegated-token.service';
import { parseUrn, buildUrn } from '../domain/urn.util';
import { RelationType } from '../domain/relationship-types';
import { IntegrationRelationship } from '@docmost/db/types/entity.types';
import { PlaneWorkItem } from './plane-client.service';

export interface CreateFromHubInput {
  workspaceId: string;
  actorId: string;
  /** Hub source object the work implements (page or requirement block). */
  sourceUrn: string;
  planeProjectId: string;
  title: string;
  descriptionHtml?: string;
  priority?: string;
  /** Relation stated from the Hub side; defaults to specified_by. */
  relationType?: RelationType;
}

export interface CreateFromHubResult {
  status: 'created' | 'created_link_failed';
  workItem: PlaneWorkItem;
  workItemUrn: string;
  relationship?: IntegrationRelationship;
  correlationId: string;
  warning?: string;
}

/**
 * Create-work-item-from-Hub-selection workflow (blueprint §5.1A).
 *
 * Creates the work item in Plane (the owner of work), then records a typed,
 * provenance-tagged relationship back to the Hub source. If the item is created
 * but linking fails, we report `created_link_failed` — never a false success
 * (blueprint §5.1B partial-failure honesty, §10 workflow state is explicit).
 */
@Injectable()
export class WorkItemCreationService {
  private readonly logger = new Logger(WorkItemCreationService.name);

  private static readonly MAX_BATCH = 100;

  constructor(
    private readonly plane: PlaneClientService,
    private readonly relationships: RelationshipService,
    private readonly delegatedTokens: DelegatedTokenService,
  ) {}

  async createFromHub(
    input: CreateFromHubInput,
  ): Promise<CreateFromHubResult> {
    if (!this.plane.isEnabled()) {
      throw new BadRequestException('Plane integration is not configured');
    }
    // Validate the Hub source URN up front so we never create an orphan item.
    let source;
    try {
      source = parseUrn(input.sourceUrn);
    } catch {
      throw new BadRequestException(`Invalid sourceUrn: ${input.sourceUrn}`);
    }
    if (source.product !== 'hub') {
      throw new BadRequestException('sourceUrn must be a ConqrHub object');
    }
    if (!input.title?.trim()) {
      throw new BadRequestException('title is required');
    }
    if (!input.planeProjectId?.trim()) {
      throw new BadRequestException('planeProjectId is required');
    }

    const correlationId = randomUUID();

    // Mint a short-lived, least-privilege on-behalf-of token so the write
    // carries the acting user's identity, not an anonymous bot (§9.1).
    const oboToken = this.delegatedTokens.mint({
      actorId: input.actorId,
      workspaceId: input.workspaceId,
      audience: 'plane-adapter',
      scope: ['work-item:create'],
    });

    // 1) Create the work item in Plane (owner of work).
    const workItem = await this.plane.createWorkItem(
      input.planeProjectId,
      {
        name: input.title,
        description_html: input.descriptionHtml,
        priority: input.priority,
      },
      { onBehalfOf: oboToken },
    );

    const workItemUrn = buildUrn('plane', 'work-item', workItem.id);
    const relationType = input.relationType ?? RelationType.SpecifiedBy;

    // 2) Link Hub source → new work item with provenance.
    try {
      const relationship = await this.relationships.create({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        sourceUrn: source.urn,
        targetUrn: workItemUrn,
        relationType,
        provenance: 'hub.selection.create-work-item',
        sourceVersion: workItem.updated_at
          ? { plane_updated_at: workItem.updated_at }
          : undefined,
        metadata: { target_project_id: input.planeProjectId },
        correlationId,
      });
      return {
        status: 'created',
        workItem,
        workItemUrn,
        relationship,
        correlationId,
      };
    } catch (err) {
      // The item exists in Plane; be honest that only the link failed.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Work item ${workItem.id} created but linking failed: ${message}`,
      );
      return {
        status: 'created_link_failed',
        workItem,
        workItemUrn,
        correlationId,
        warning:
          'Work item was created in Plane but could not be linked. Retry the link.',
      };
    }
  }

  /**
   * Bulk-create work items from a Hub table/checklist (blueprint §5.1B).
   * Atomic INTENT, practical partial completion: each row reports its own
   * outcome and index; a failure at row N never fakes success for the batch and
   * never silently drops rows. Required-field validation happens per row before
   * any Plane call for that row.
   */
  async createManyFromHub(input: {
    workspaceId: string;
    actorId: string;
    planeProjectId: string;
    rows: Array<{
      sourceUrn: string;
      title: string;
      descriptionHtml?: string;
      priority?: string;
    }>;
  }): Promise<{
    total: number;
    created: number;
    failed: number;
    results: Array<{
      index: number;
      status: 'created' | 'created_link_failed' | 'failed';
      workItemUrn?: string;
      error?: string;
    }>;
  }> {
    if (!this.plane.isEnabled()) {
      throw new BadRequestException('Plane integration is not configured');
    }
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw new BadRequestException('rows is required');
    }
    if (input.rows.length > WorkItemCreationService.MAX_BATCH) {
      throw new BadRequestException(
        `Batch too large (max ${WorkItemCreationService.MAX_BATCH})`,
      );
    }

    const results: Array<{
      index: number;
      status: 'created' | 'created_link_failed' | 'failed';
      workItemUrn?: string;
      error?: string;
    }> = [];

    // Sequential to respect Plane's rate limit and keep per-row attribution.
    for (let i = 0; i < input.rows.length; i++) {
      const row = input.rows[i];
      try {
        const res = await this.createFromHub({
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          sourceUrn: row.sourceUrn,
          planeProjectId: input.planeProjectId,
          title: row.title,
          descriptionHtml: row.descriptionHtml,
          priority: row.priority,
        });
        results.push({
          index: i,
          status: res.status,
          workItemUrn: res.workItemUrn,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ index: i, status: 'failed', error: message });
      }
    }

    const created = results.filter((r) => r.status !== 'failed').length;
    return {
      total: input.rows.length,
      created,
      failed: results.length - created,
      results,
    };
  }
}
