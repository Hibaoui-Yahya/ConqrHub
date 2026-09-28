import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  PlaneApiError,
  PlaneClientService,
} from '../../../../core/integration/services/plane-client.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import {
  WorkItemFieldArgs,
  normalizeWorkItem,
  workItemWritableFields,
  writeWorkItem,
} from './work-item-fields';
import { DELEGATED_SCOPES } from '../../../../core/integration/domain/delegated-token.util';
import { DelegatedTokenService } from '../../../../core/integration/services/delegated-token.service';
import { delegateForPlane } from './plane-delegation.helper';

/**
 * Cross-product tools: let the suite assistant (chat + MCP) read and create
 * ConqrPlan work items through the integration layer's Plane REST adapter.
 * Registered only when the Plane integration is configured, so an
 * unconfigured deployment never advertises dead tools.
 */
export function toolError(err: unknown): { error: string } {
  if (err instanceof PlaneApiError) {
    return { error: `ConqrPlan request failed (${err.status || 'network'}): ${err.message}` };
  }
  return { error: `ConqrPlan request failed: ${err instanceof Error ? err.message : String(err)}` };
}

/**
 * Summary of a hit from the work-item SEARCH endpoint.
 *
 * Django `.values()` output, so the fields are ORM paths rather than the
 * nested objects the list and detail endpoints return — `state__name` here
 * where `workItemSummary` reads `state_detail.name`. Keeping them apart
 * avoids a summariser that quietly returns null for whichever shape it was
 * not written for.
 */
export const workItemSearchSummary = (w: any) => ({
  id: w.id,
  name: w.name,
  sequenceId: w.sequence_id ?? null,
  state: w.state__name ?? null,
  priority: w.priority ?? null,
  projectId: w.project_id ?? null,
  projectIdentifier: w.project__identifier ?? null,
});

export const workItemSummary = (w: any) => ({
  id: w.id,
  name: w.name,
  sequenceId: w.sequence_id,
  state: w.state_detail?.name ?? w.state ?? null,
  priority: w.priority ?? null,
  // Estimate point ID (resolve to a value via list_estimate_points).
  estimatePointId: w.estimate_point ?? null,
  updatedAt: w.updated_at ?? null,
});

@Injectable()
export class ListConqrPlanProjectsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_conqrplan_projects';
  readonly description =
    'List projects in ConqrPlan (the Conqr suite work-management app). Use this to find a project ID before searching or creating work items.';
  readonly parameters = z.object({});
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(_args: unknown, ctx: ChatToolContext) {
    // Delegated like every other read: the caller sees the projects they are a
    // member of, not the projects the bridge credential can reach.
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      return await this.plane.listProjects(call);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class SearchWorkItemsTool implements ChatTool, OnModuleInit {
  readonly name = 'search_work_items';
  readonly description =
    'Search ConqrPlan work items by text across the whole workspace, or inside one project when projectId is given. Matches on name, sequence id and project identifier. Returns id, name, state, priority and the owning project. Cite work items by name and sequenceId. Omit the query to list a project instead.';
  readonly parameters = z.object({
    projectId: z
      .string()
      .optional()
      .describe(
        'Restrict to one ConqrPlan project (from list_conqrplan_projects). Omit to search every project you belong to.',
      ),
    query: z
      .string()
      .optional()
      .describe('Text to search for. Omit to list a project — then projectId is required.'),
    limit: z.number().int().min(1).max(200).optional().default(50),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId?: string; query?: string; limit?: number },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    const limit = args.limit ?? 50;
    const query = (args.query ?? '').trim();
    try {
      // A query goes to the search endpoint. The issue LIST endpoint has no
      // `search` parameter and ignores one, so routing a query through it
      // returned the project's first N items for every term — matches that
      // were never matches. Without a query there is nothing to search, so
      // listing one project is the only sensible reading.
      if (query) {
        const { results } = await this.plane.searchWorkItems(
          { query, limit, projectId: args.projectId },
          call,
        );
        return results.map(workItemSearchSummary);
      }

      if (!args.projectId) {
        return toolError(
          new Error(
            'Pass a query to search across the workspace, or a projectId to list one project.',
          ),
        );
      }
      const { results } = await this.plane.listWorkItems(
        args.projectId,
        { perPage: limit },
        call,
      );
      return results.map(workItemSummary);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class GetWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'get_work_item';
  readonly description = 'Get one ConqrPlan work item with its description, state, and priority.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; workItemId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      const w = await this.plane.getWorkItem(args.projectId, args.workItemId, call);
      // Full normalised representation: the previous shape dropped assignees
      // and labels even though the payload carried them, so a caller could not
      // confirm what a write had actually stored.
      return normalizeWorkItem(w, args.projectId);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class CreateWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'create_work_item';
  readonly description =
    'Create a work item in a ConqrPlan project with its full field set: state, assignees, labels, dates, parent, type, estimate, cycle and modules. Use only when the user explicitly asks to create work. Returns the complete stored item. Ids that would be silently dropped are rejected instead.';
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    ...workItemWritableFields,
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId: string; name: string } & WorkItemFieldArgs,
    ctx: ChatToolContext,
  ) {
    const { projectId, name, ...fields } = args;
    // Creating an item may also place it in a cycle or modules, so the
    // delegation carries those scopes too - and nothing else.
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.workItemCreate,
      DELEGATED_SCOPES.cycleAssign,
      DELEGATED_SCOPES.moduleAssign,
    ]);
    return writeWorkItem(this.plane, projectId, { kind: 'create', name }, fields, call);
  }
}

@Injectable()
export class GetProjectCyclesTool implements ChatTool, OnModuleInit {
  readonly name = 'get_project_cycles';
  readonly description =
    'List cycles (iterations) of a ConqrPlan project with their date ranges. Use for status questions like "what is in the current cycle".';
  readonly parameters = z.object({ projectId: z.string() });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      return await this.plane.listCycles(args.projectId, call);
    } catch (err) {
      return toolError(err);
    }
  }
}

export const PLANE_WORK_ITEM_TOOLS = [
  ListConqrPlanProjectsTool,
  SearchWorkItemsTool,
  GetWorkItemTool,
  CreateWorkItemTool,
  GetProjectCyclesTool,
];
