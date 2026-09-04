import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PlaneClientService } from '../../../../core/integration/services/plane-client.service';
import { WorkItemCreationService } from '../../../../core/integration/services/work-item-creation.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import {
  WorkItemFieldArgs,
  fail,
  planeError,
  workItemWritableFields,
  writeWorkItem,
} from './work-item-fields';

/**
 * ConqrPlan Control Foundation v1: bulk work-item creation and estimate
 * (story point) configuration.
 *
 * ConqrPlan stays the authority for validation, permissions and tenant
 * scoping. These tools are transport and orchestration only - they add no
 * work-management rules of their own.
 */

// ==========================================================================
// Bulk creation
// ==========================================================================

/**
 * Per-row outcome. Every requested row gets exactly one of these back, keyed
 * by its index in the request, whether it succeeded or not.
 */
interface BulkRowResult {
  index: number;
  status: 'created' | 'duplicate' | 'partial' | 'failed';
  workItemId?: string;
  urn?: string;
  sequenceId?: number | null;
  name: string;
  error?: string;
  code?: string;
  details?: unknown;
}

@Injectable()
export class BulkCreateWorkItemsTool implements ChatTool, OnModuleInit {
  readonly name = 'bulk_create_work_items';
  readonly description =
    'Create up to 100 ConqrPlan work items in one call, each with the same fields as create_work_item. Items are created one at a time and there is no rollback: every row reports its own outcome and index, so a failure part-way through never fakes success for the batch. Give each row an externalId to make retries safe. Use only when the user explicitly asks to create work.';

  readonly parameters = z.object({
    projectId: z.string().describe('Target ConqrPlan project. All rows go to this project.'),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(255),
          ...workItemWritableFields,
        }),
      )
      .min(1)
      .max(WorkItemCreationService.MAX_BATCH)
      .describe(
        `Between 1 and ${WorkItemCreationService.MAX_BATCH} work items. Larger requests are refused before any item is created.`,
      ),
  });

  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }

  async execute(
    args: { projectId: string; items: ({ name: string } & WorkItemFieldArgs)[] },
    ctx: ChatToolContext,
  ) {
    const items = args.items ?? [];

    // Enforce the ceiling before touching ConqrPlan, so an oversized request
    // never creates a partial batch it cannot finish.
    if (items.length === 0) {
      return fail('VALIDATION_FAILED', 'items must contain at least one work item.', {
        field: 'items',
      });
    }
    if (items.length > WorkItemCreationService.MAX_BATCH) {
      return fail(
        'LIMIT_EXCEEDED',
        `Batch too large: ${items.length} items requested, maximum is ${WorkItemCreationService.MAX_BATCH}. Nothing was created.`,
        { field: 'items', details: { requested: items.length, max: WorkItemCreationService.MAX_BATCH } },
      );
    }

    // Reject duplicate idempotency keys inside one batch: the first row would
    // create the item and the rest would come back as conflicts, which reads
    // like a server problem rather than a malformed request.
    const seen = new Map<string, number>();
    for (let i = 0; i < items.length; i++) {
      const key = items[i].externalId;
      if (!key) continue;
      if (seen.has(key)) {
        return fail(
          'VALIDATION_FAILED',
          `Duplicate externalId '${key}' at items[${i}] and items[${seen.get(key)}]. Nothing was created.`,
          { field: 'items', details: { externalId: key, indexes: [seen.get(key), i] } },
        );
      }
      seen.set(key, i);
    }

    // Sequential, matching the existing batch path: it respects ConqrPlan's
    // rate limit and keeps per-row attribution. ConqrPlan exposes no bulk
    // create and no cross-item transaction, so there is nothing to roll back
    // to and partial completion is the real behaviour, reported as such.
    const results: BulkRowResult[] = [];
    for (let index = 0; index < items.length; index++) {
      const { name, ...fields } = items[index];
      const outcome = await writeWorkItem(
        this.plane,
        args.projectId,
        { kind: 'create', name },
        fields,
        { onBehalfOf: ctx.user.id },
      );

      const asError = outcome as { error?: string; code?: string; details?: unknown };
      const asItem = outcome as { id?: string; urn?: string; sequenceId?: number | null };

      if (asItem.id && !asError.error) {
        results.push({
          index,
          status: 'created',
          workItemId: asItem.id,
          urn: asItem.urn,
          sequenceId: asItem.sequenceId ?? null,
          name,
        });
      } else if (asItem.id && asError.code === 'PARTIAL_WRITE') {
        results.push({
          index,
          status: 'partial',
          workItemId: asItem.id,
          urn: asItem.urn,
          sequenceId: asItem.sequenceId ?? null,
          name,
          error: asError.error,
          code: asError.code,
          details: asError.details,
        });
      } else if (asError.code === 'CONFLICT') {
        results.push({
          index,
          status: 'duplicate',
          workItemId: (asError.details as any)?.existingWorkItemId ?? undefined,
          name,
          error: asError.error,
          code: asError.code,
        });
      } else {
        results.push({
          index,
          status: 'failed',
          name,
          error: asError.error ?? 'Unknown failure',
          code: asError.code ?? 'UPSTREAM_ERROR',
          details: asError.details,
        });
      }
    }

    const count = (status: BulkRowResult['status']) =>
      results.filter((r) => r.status === status).length;

    return {
      projectId: args.projectId,
      total: items.length,
      created: count('created'),
      partial: count('partial'),
      duplicate: count('duplicate'),
      failed: count('failed'),
      /** One entry per requested row, in request order. */
      results,
    };
  }
}

// ==========================================================================
// Estimates (story points)
// ==========================================================================

@Injectable()
export class GetEstimateSystemTool implements ChatTool, OnModuleInit {
  readonly name = 'get_estimate_system';
  readonly description =
    "Read a ConqrPlan project's estimation (story point) configuration: whether a system exists, whether it is active, and its point values. A system that exists but is inactive is invisible in the ConqrPlan UI and cannot hold values.";
  readonly parameters = z.object({ projectId: z.string() });

  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }

  async execute(args: { projectId: string }, _ctx: ChatToolContext) {
    try {
      const estimate = await this.plane.getProjectEstimate(args.projectId);
      if (!estimate) {
        return {
          configured: false,
          isActive: false,
          message:
            'This project has no estimation system. Create one with create_estimate_system before setting story points.',
        };
      }
      let points: { id: string; key: number; value: string }[] = [];
      try {
        points = await this.plane.listEstimatePoints(args.projectId, estimate.id);
      } catch {
        points = estimate.points ?? [];
      }
      return {
        configured: true,
        isActive: estimate.is_active !== false,
        id: estimate.id,
        name: estimate.name,
        type: estimate.type ?? null,
        points: points.map((p) => ({ id: p.id, key: p.key, value: p.value })),
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class CreateEstimateSystemTool implements ChatTool, OnModuleInit {
  readonly name = 'create_estimate_system';
  readonly description =
    'Create and activate a story point estimation system on a ConqrPlan project, with its point values. A project can hold one system. Activation is what makes the estimate field appear in the ConqrPlan UI. Use only when the user explicitly asks to set up estimation.';
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255).describe("For example 'Fibonacci' or 'T-shirt sizes'."),
    type: z
      .enum(['points', 'categories'])
      .optional()
      .describe("'points' for numeric story points, 'categories' for named sizes. Defaults to points."),
    values: z
      .array(z.string().min(1).max(20))
      .min(1)
      .max(20)
      .describe("Point values in order, for example ['1','2','3','5','8']. Each at most 20 characters."),
  });

  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }

  async execute(
    args: { projectId: string; name: string; type?: 'points' | 'categories'; values: string[] },
    ctx: ChatToolContext,
  ) {
    try {
      const existing = await this.plane.getProjectEstimate(args.projectId);
      if (existing) {
        return fail(
          'CONFLICT',
          `This project already has an estimation system ('${existing.name}'). A project can hold one system. Use activate_estimate_system to switch it on, or delete the existing one first.`,
          { field: 'projectId', details: { existingEstimateId: existing.id } },
        );
      }

      const created = await this.plane.createEstimate(
        args.projectId,
        { name: args.name, type: args.type ?? 'points' },
        { onBehalfOf: ctx.user.id },
      );

      const points = await this.plane.createEstimatePoints(
        args.projectId,
        created.id,
        args.values.map((value, key) => ({ key, value })),
        { onBehalfOf: ctx.user.id },
      );

      // Confirm activation from the server rather than assuming it.
      const confirmed = await this.plane.getProjectEstimate(args.projectId);
      const isActive = confirmed?.is_active !== false;

      const result = {
        id: created.id,
        name: created.name,
        type: created.type ?? args.type ?? 'points',
        isActive,
        points: points.map((p) => ({ id: p.id, key: p.key, value: p.value })),
      };

      if (!isActive) {
        return {
          ...result,
          error:
            'The estimation system was created but is not active on the project, so it stays hidden in ConqrPlan. Call activate_estimate_system.',
          code: 'PARTIAL_WRITE',
        };
      }
      return result;
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class ActivateEstimateSystemTool implements ChatTool, OnModuleInit {
  readonly name = 'activate_estimate_system';
  readonly description =
    "Switch a ConqrPlan project's estimation system on or off. Activation is what makes story points visible and editable in the ConqrPlan UI. Safe to call repeatedly: activating an already active system changes nothing.";
  readonly parameters = z.object({
    projectId: z.string(),
    active: z
      .boolean()
      .optional()
      .describe('true activates the system (default), false switches estimation off for the project.'),
  });

  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}

  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }

  async execute(args: { projectId: string; active?: boolean }, ctx: ChatToolContext) {
    const active = args.active ?? true;
    try {
      const existing = await this.plane.getProjectEstimate(args.projectId);
      if (!existing) {
        return fail(
          'NO_ESTIMATE_SYSTEM',
          'This project has no estimation system to activate. Create one with create_estimate_system.',
          { field: 'projectId' },
        );
      }
      const updated = await this.plane.updateEstimate(
        args.projectId,
        { is_active: active },
        { onBehalfOf: ctx.user.id },
      );
      return {
        id: updated.id ?? existing.id,
        name: updated.name ?? existing.name,
        isActive: updated.is_active !== false && active,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

export const PLANE_CONTROL_TOOLS = [
  BulkCreateWorkItemsTool,
  GetEstimateSystemTool,
  CreateEstimateSystemTool,
  ActivateEstimateSystemTool,
];
