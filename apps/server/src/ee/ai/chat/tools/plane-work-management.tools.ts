import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PlaneClientService } from '../../../../core/integration/services/plane-client.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { toolError, workItemSummary } from './plane-work-items.tools';

/**
 * Deeper ConqrPlan work-management coverage for the suite assistant
 * (chat + MCP): updating items, moving them through states, reading and
 * writing item comments, seeing what is inside a cycle, and resolving
 * assignees to people. Like the base work-item tools, these register only
 * when the Plane integration is configured.
 */

const toHtml = (text?: string): string | undefined =>
  text === undefined
    ? undefined
    : text.trim().startsWith('<')
      ? text
      : `<p>${text}</p>`;

@Injectable()
export class UpdateWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'update_work_item';
  readonly description =
    'Update a ConqrPlan work item: rename it, edit its description, change priority, move it to another state (stateId from list_work_item_states), or set its estimate (estimatePointId from list_estimate_points). Only send the fields you want to change. Use only when the user explicitly asks.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional().describe('Plain-text or HTML description'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
    stateId: z
      .string()
      .optional()
      .describe('Target state ID (from list_work_item_states)'),
    estimatePointId: z
      .string()
      .nullable()
      .optional()
      .describe('Estimate point ID (from list_estimate_points); null clears the estimate'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: {
      projectId: string;
      workItemId: string;
      name?: string;
      description?: string;
      priority?: string;
      stateId?: string;
      estimatePointId?: string | null;
    },
    ctx: ChatToolContext,
  ) {
    if (
      args.name === undefined &&
      args.description === undefined &&
      args.priority === undefined &&
      args.stateId === undefined &&
      args.estimatePointId === undefined
    ) {
      return { error: 'Nothing to update — pass at least one of name, description, priority, stateId, estimatePointId.' };
    }
    try {
      const w = await this.plane.updateWorkItem(
        args.projectId,
        args.workItemId,
        {
          name: args.name,
          description_html: toHtml(args.description),
          priority: args.priority,
          state: args.stateId,
          ...(args.estimatePointId !== undefined
            ? { estimate_point: args.estimatePointId }
            : {}),
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
export class ListWorkItemStatesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_work_item_states';
  readonly description =
    'List the workflow states of a ConqrPlan project (e.g. Backlog, In Progress, Done) with their IDs and state group. Use before update_work_item to move an item to a named state, or to interpret state values.';
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
      const states = await this.plane.listStates(args.projectId);
      return states.map((s) => ({
        id: s.id,
        name: s.name,
        group: s.group ?? null,
        default: s.default ?? false,
      }));
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class GetWorkItemCommentsTool implements ChatTool, OnModuleInit {
  readonly name = 'get_work_item_comments';
  readonly description =
    'Read the comment thread of a ConqrPlan work item (discussion, decisions, status updates). Returns plain-text comments with author IDs — resolve authors with list_conqrplan_members.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
    limit: z.number().int().min(1).max(50).optional().default(20),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId: string; workItemId: string; limit?: number },
    _ctx: ChatToolContext,
  ) {
    try {
      const comments = await this.plane.listWorkItemComments(
        args.projectId,
        args.workItemId,
      );
      return comments.slice(0, args.limit ?? 20).map((c) => ({
        id: c.id,
        text: c.comment_stripped ?? stripHtml(c.comment_html) ?? '',
        actorId: c.actor ?? null,
        createdAt: c.created_at ?? null,
      }));
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class AddWorkItemCommentTool implements ChatTool, OnModuleInit {
  readonly name = 'add_work_item_comment';
  readonly description =
    'Post a comment on a ConqrPlan work item. Comments are visible to the whole project — write them like a teammate would, and use only when the user asks.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
    text: z.string().min(1).describe('Plain-text or HTML comment body'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId: string; workItemId: string; text: string },
    ctx: ChatToolContext,
  ) {
    try {
      const c = await this.plane.addWorkItemComment(
        args.projectId,
        args.workItemId,
        toHtml(args.text)!,
        { onBehalfOf: ctx.user.id },
      );
      return { id: c.id, createdAt: c.created_at ?? null, success: true };
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class ListCycleWorkItemsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_cycle_work_items';
  readonly description =
    'List the work items inside one ConqrPlan cycle (sprint/iteration). Use with get_project_cycles to answer "what is in the current cycle" or to report sprint progress.';
  readonly parameters = z.object({
    projectId: z.string(),
    cycleId: z.string().describe('Cycle ID (from get_project_cycles)'),
    limit: z.number().int().min(1).max(100).optional().default(50),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(
    args: { projectId: string; cycleId: string; limit?: number },
    _ctx: ChatToolContext,
  ) {
    try {
      const items = await this.plane.listCycleWorkItems(
        args.projectId,
        args.cycleId,
      );
      return items.slice(0, args.limit ?? 50).map(workItemSummary);
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class ListEstimatePointsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_estimate_points';
  readonly description =
    'List a ConqrPlan project\'s estimate systems and their points (e.g. Fibonacci 1/2/3/5/8) with IDs. Use to resolve a work item\'s estimatePointId to a value, or before setting an estimate via update_work_item. Empty when the project has no estimate system.';
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
      const estimates = await this.plane.listEstimates(args.projectId);
      return estimates.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type ?? null,
        points: (e.points ?? [])
          .slice()
          .sort((a, b) => (a.key ?? 0) - (b.key ?? 0))
          .map((p) => ({ id: p.id, value: p.value })),
      }));
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class ListWorkItemLabelsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_work_item_labels';
  readonly description =
    'List the labels of a ConqrPlan project (id, name, color). Use to interpret label IDs on work items.';
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
      const labels = await this.plane.listLabels(args.projectId);
      return labels.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null }));
    } catch (err) {
      return toolError(err);
    }
  }
}

@Injectable()
export class ListConqrPlanMembersTool implements ChatTool, OnModuleInit {
  readonly name = 'list_conqrplan_members';
  readonly description =
    'List the members of the ConqrPlan workspace (id, display name, email). Use to resolve assignee and comment-author IDs to real people.';
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
      const members = await this.plane.listWorkspaceMembers();
      return members.map((m) => ({
        id: m.id,
        displayName:
          m.display_name ||
          [m.first_name, m.last_name].filter(Boolean).join(' ') ||
          null,
        email: m.email ?? null,
      }));
    } catch (err) {
      return toolError(err);
    }
  }
}

function stripHtml(html?: string): string | undefined {
  if (!html) return undefined;
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const PLANE_WORK_MANAGEMENT_TOOLS = [
  UpdateWorkItemTool,
  ListWorkItemStatesTool,
  GetWorkItemCommentsTool,
  AddWorkItemCommentTool,
  ListCycleWorkItemsTool,
  ListEstimatePointsTool,
  ListWorkItemLabelsTool,
  ListConqrPlanMembersTool,
];
