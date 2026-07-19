import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import {
  PlaneApiError,
  PlaneClientService,
} from '../../../../core/integration/services/plane-client.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';

/**
 * Cross-product tools: let the suite assistant (chat + MCP) read and create
 * ConqrPlane work items through the integration layer's Plane REST adapter.
 * Registered only when the Plane integration is configured, so an
 * unconfigured deployment never advertises dead tools.
 */
function toolError(err: unknown): { error: string } {
  if (err instanceof PlaneApiError) {
    return { error: `ConqrPlane request failed (${err.status || 'network'}): ${err.message}` };
  }
  return { error: `ConqrPlane request failed: ${err instanceof Error ? err.message : String(err)}` };
}

const workItemSummary = (w: any) => ({
  id: w.id,
  name: w.name,
  sequenceId: w.sequence_id,
  state: w.state_detail?.name ?? w.state ?? null,
  priority: w.priority ?? null,
  updatedAt: w.updated_at ?? null,
});

@Injectable()
export class ListConqrPlaneProjectsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_conqrplane_projects';
  readonly description =
    'List projects in ConqrPlane (the Conqr suite work-management app). Use this to find a project ID before searching or creating work items.';
  readonly parameters = z.object({});
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(_args: unknown, _ctx: ChatToolContext) {
    try {
      return await this.plane.listProjects();
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class SearchWorkItemsTool implements ChatTool, OnModuleInit {
  readonly name = 'search_work_items';
  readonly description =
    'Search work items in a ConqrPlane project by text. Returns id, name, state, and priority. Cite work items by name and sequenceId.';
  readonly parameters = z.object({
    projectId: z.string().describe('ConqrPlane project ID (from list_conqrplane_projects)'),
    query: z.string().optional().describe('Text to search work item names for'),
    limit: z.number().int().min(1).max(50).optional().default(20),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; query?: string; limit?: number }, _ctx: ChatToolContext) {
    try {
      const { results } = await this.plane.listWorkItems(args.projectId, {
        search: args.query,
        perPage: args.limit ?? 20,
      });
      return results.map(workItemSummary);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class GetWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'get_work_item';
  readonly description = 'Get one ConqrPlane work item with its description, state, and priority.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; workItemId: string }, _ctx: ChatToolContext) {
    try {
      const w = await this.plane.getWorkItem(args.projectId, args.workItemId);
      return { ...workItemSummary(w), description: w.description_stripped ?? null };
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class CreateWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'create_work_item';
  readonly description =
    'Create a work item in a ConqrPlane project. Use only when the user explicitly asks to create work. Returns the created item.';
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    description: z.string().optional().describe('Plain-text or HTML description'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId: string; name: string; description?: string; priority?: string },
    ctx: ChatToolContext,
  ) {
    try {
      const html = args.description?.trim().startsWith('<')
        ? args.description
        : args.description
          ? `<p>${args.description}</p>`
          : undefined;
      const w = await this.plane.createWorkItem(
        args.projectId,
        {
          name: args.name,
          description_html: html,
          priority: args.priority,
        },
        { onBehalfOf: ctx.user.id },
      );
      return workItemSummary(w);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class GetProjectCyclesTool implements ChatTool, OnModuleInit {
  readonly name = 'get_project_cycles';
  readonly description =
    'List cycles (iterations) of a ConqrPlane project with their date ranges. Use for status questions like "what is in the current cycle".';
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
      return await this.plane.listCycles(args.projectId);
    } catch (err) {
      return toolError(err);
    }
  }
}

export const PLANE_WORK_ITEM_TOOLS = [
  ListConqrPlaneProjectsTool,
  SearchWorkItemsTool,
  GetWorkItemTool,
  CreateWorkItemTool,
  GetProjectCyclesTool,
];
