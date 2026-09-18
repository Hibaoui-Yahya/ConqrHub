import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PlaneClientService } from '../../../../core/integration/services/plane-client.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { planeError } from './work-item-fields';
import { DELEGATED_SCOPES } from '../../../../core/integration/domain/delegated-token.util';
import { DelegatedTokenService } from '../../../../core/integration/services/delegated-token.service';
import { delegateForPlane } from './plane-delegation.helper';

/**
 * The half of ConqrPlan's CRUD the tool surface never exposed.
 *
 * Every endpoint behind these tools already existed; nothing called it, so an
 * agent could create a work item but not remove one, post a comment but not
 * correct it, and read labels, states, cycles and modules without being able
 * to make any. Each tool here closes one of those gaps.
 *
 * Deletes are irreversible on ConqrPlan's side, so their descriptions say so
 * plainly: the model reads the description before it decides, and "permanent"
 * in the description is worth more than any confirmation added afterwards.
 */

/**
 * Every tool declares its own constructor.
 *
 * NestJS resolves constructor parameters from `design:paramtypes`, which
 * TypeScript only emits on a class that declares a constructor. A shared
 * abstract base looks tidier but leaves each subclass with no metadata of its
 * own, so Nest injects nothing and the dependency is undefined at
 * onModuleInit — which took the whole app down at boot.
 */

const toHtml = (text: string): string =>
  text.trim().startsWith('<') ? text : `<p>${text}</p>`;

// ---------------------------------------------------------------------------
// Work items
// ---------------------------------------------------------------------------

@Injectable()
export class DeleteWorkItemTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_work_item';
  readonly description =
    'Permanently delete a ConqrPlan work item. This cannot be undone and there is no trash to recover it from, unlike delete_page. Prefer moving the item to a Cancelled state with update_work_item unless the user explicitly asked for deletion.';
  readonly parameters = z.object({
    projectId: z.string().describe('ConqrPlan project ID (from list_conqrplan_projects)'),
    workItemId: z.string().describe('The work item to delete'),
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
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.workItemDelete,
    ]);
    try {
      await this.plane.deleteWorkItem(args.projectId, args.workItemId, call);
      return { success: true, workItemId: args.workItemId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Work-item comments
// ---------------------------------------------------------------------------

@Injectable()
export class UpdateWorkItemCommentTool implements ChatTool, OnModuleInit {
  readonly name = 'update_work_item_comment';
  readonly description =
    "Edit an existing comment on a ConqrPlan work item. Replaces the comment body. Restricted to the comment's own author.";
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
    commentId: z.string().describe('From get_work_item_comments'),
    text: z.string().min(1).describe('The replacement comment body'),
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
    args: { projectId: string; workItemId: string; commentId: string; text: string },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.commentWrite]);
    try {
      const comment = await this.plane.updateWorkItemComment(
        args.projectId,
        args.workItemId,
        args.commentId,
        toHtml(args.text),
        call,
      );
      return { success: true, commentId: comment?.id ?? args.commentId };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteWorkItemCommentTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_work_item_comment';
  readonly description =
    'Delete a comment from a ConqrPlan work item. Authors can remove their own; project admins can remove any.';
  readonly parameters = z.object({
    projectId: z.string(),
    workItemId: z.string(),
    commentId: z.string().describe('From get_work_item_comments'),
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
    args: { projectId: string; workItemId: string; commentId: string },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.commentWrite]);
    try {
      await this.plane.deleteWorkItemComment(
        args.projectId,
        args.workItemId,
        args.commentId,
        call,
      );
      return { success: true, commentId: args.commentId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

@Injectable()
export class CreateWorkItemLabelTool implements ChatTool, OnModuleInit {
  readonly name = 'create_work_item_label';
  readonly description =
    'Create a label in a ConqrPlan project. Labels are per-project: the same name in two projects is two different labels. Assign one to an item with update_work_item.';
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    color: z
      .string()
      .regex(HEX_COLOR, 'Use a hex colour such as #2f80ed')
      .optional(),
    description: z.string().max(1000).optional(),
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
    args: { projectId: string; name: string; color?: string; description?: string },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const label = await this.plane.createLabel(
        args.projectId,
        { name: args.name, color: args.color, description: args.description },
        call,
      );
      return { success: true, id: label?.id, name: label?.name ?? args.name };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateWorkItemLabelTool implements ChatTool, OnModuleInit {
  readonly name = 'update_work_item_label';
  readonly description =
    'Rename a ConqrPlan label or change its colour. Send only what changes. Items already carrying the label keep it.';
  readonly parameters = z.object({
    projectId: z.string(),
    labelId: z.string().describe('From list_work_item_labels'),
    name: z.string().min(1).max(255).optional(),
    color: z.string().regex(HEX_COLOR, 'Use a hex colour such as #2f80ed').optional(),
    description: z.string().max(1000).optional(),
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
    args: {
      projectId: string;
      labelId: string;
      name?: string;
      color?: string;
      description?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const label = await this.plane.updateLabel(
        args.projectId,
        args.labelId,
        { name: args.name, color: args.color, description: args.description },
        call,
      );
      return { success: true, id: label?.id ?? args.labelId, name: label?.name };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteWorkItemLabelTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_work_item_label';
  readonly description =
    'Delete a ConqrPlan label. The work items carrying it are not deleted; they simply lose the label. Permanent.';
  readonly parameters = z.object({
    projectId: z.string(),
    labelId: z.string().describe('From list_work_item_labels'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; labelId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      await this.plane.deleteLabel(args.projectId, args.labelId, call);
      return { success: true, labelId: args.labelId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Workflow states
// ---------------------------------------------------------------------------

/** ConqrPlan groups every state into one of these buckets. */
const STATE_GROUPS = [
  'backlog',
  'unstarted',
  'started',
  'completed',
  'cancelled',
] as const;

@Injectable()
export class CreateWorkItemStateTool implements ChatTool, OnModuleInit {
  readonly name = 'create_work_item_state';
  readonly description =
    "Create a workflow state in a ConqrPlan project. `group` decides how the state behaves in reporting: only 'completed' counts an item as done, and 'cancelled' counts as abandoned, not finished. State ids differ per project.";
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    group: z
      .enum(STATE_GROUPS)
      .describe('Reporting bucket this state belongs to'),
    color: z.string().regex(HEX_COLOR, 'Use a hex colour such as #2f80ed').optional(),
    description: z.string().max(1000).optional(),
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
    args: {
      projectId: string;
      name: string;
      group: (typeof STATE_GROUPS)[number];
      color?: string;
      description?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const state = await this.plane.createState(
        args.projectId,
        {
          name: args.name,
          group: args.group,
          color: args.color,
          description: args.description,
        },
        call,
      );
      return {
        success: true,
        id: state?.id,
        name: state?.name ?? args.name,
        group: state?.group ?? args.group,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateWorkItemStateTool implements ChatTool, OnModuleInit {
  readonly name = 'update_work_item_state';
  readonly description =
    'Rename a ConqrPlan workflow state, recolour it, or move it to another reporting group. Send only what changes. This edits the state itself — to move a work item between states use update_work_item.';
  readonly parameters = z.object({
    projectId: z.string(),
    stateId: z.string().describe('From list_work_item_states'),
    name: z.string().min(1).max(255).optional(),
    group: z.enum(STATE_GROUPS).optional(),
    color: z.string().regex(HEX_COLOR, 'Use a hex colour such as #2f80ed').optional(),
    description: z.string().max(1000).optional(),
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
    args: {
      projectId: string;
      stateId: string;
      name?: string;
      group?: (typeof STATE_GROUPS)[number];
      color?: string;
      description?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const state = await this.plane.updateState(
        args.projectId,
        args.stateId,
        {
          name: args.name,
          group: args.group,
          color: args.color,
          description: args.description,
        },
        call,
      );
      return { success: true, id: state?.id ?? args.stateId, name: state?.name };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteWorkItemStateTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_work_item_state';
  readonly description =
    'Delete a workflow state from a ConqrPlan project. ConqrPlan refuses while work items still sit in it, and refuses for the default state — move those items first with update_work_item.';
  readonly parameters = z.object({
    projectId: z.string(),
    stateId: z.string().describe('From list_work_item_states'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; stateId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      await this.plane.deleteState(args.projectId, args.stateId, call);
      return { success: true, stateId: args.stateId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = z
  .string()
  .regex(ISO_DATE, 'Use YYYY-MM-DD');

/** ConqrPlan's module lifecycle values. */
const MODULE_STATUSES = [
  'backlog',
  'planned',
  'in-progress',
  'paused',
  'completed',
  'cancelled',
] as const;

@Injectable()
export class CreateCycleTool implements ChatTool, OnModuleInit {
  readonly name = 'create_cycle';
  readonly description =
    'Create a cycle (sprint) in a ConqrPlan project. Dates come as a pair: give both startDate and endDate, or neither. Put work items into it with update_work_item cycleId, not here.';
  readonly parameters = z
    .object({
      projectId: z.string(),
      name: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      startDate: isoDate.optional().describe('YYYY-MM-DD'),
      endDate: isoDate.optional().describe('YYYY-MM-DD'),
    })
    // ConqrPlan rejects a cycle carrying only one end of its range. Refusing
    // it here gives the model a correctable message instead of a raw 400.
    .refine((v) => (v.startDate === undefined) === (v.endDate === undefined), {
      message: 'Give both startDate and endDate, or neither.',
      path: ['endDate'],
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
    args: {
      projectId: string;
      name: string;
      description?: string;
      startDate?: string;
      endDate?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const cycle = await this.plane.createCycle(
        args.projectId,
        {
          name: args.name,
          description: args.description,
          start_date: args.startDate,
          end_date: args.endDate,
        },
        call,
      );
      return { success: true, id: cycle?.id, name: cycle?.name ?? args.name };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateCycleTool implements ChatTool, OnModuleInit {
  readonly name = 'update_cycle';
  readonly description =
    'Rename a ConqrPlan cycle or move its dates. Send only what changes.';
  readonly parameters = z.object({
    projectId: z.string(),
    cycleId: z.string().describe('From get_project_cycles'),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    startDate: isoDate.optional().describe('YYYY-MM-DD'),
    endDate: isoDate.optional().describe('YYYY-MM-DD'),
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
    args: {
      projectId: string;
      cycleId: string;
      name?: string;
      description?: string;
      startDate?: string;
      endDate?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const cycle = await this.plane.updateCycle(
        args.projectId,
        args.cycleId,
        {
          name: args.name,
          description: args.description,
          start_date: args.startDate,
          end_date: args.endDate,
        },
        call,
      );
      return { success: true, id: cycle?.id ?? args.cycleId, name: cycle?.name };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteCycleTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_cycle';
  readonly description =
    'Delete a ConqrPlan cycle. The work items in it are not deleted; they end up with no cycle. Permanent.';
  readonly parameters = z.object({
    projectId: z.string(),
    cycleId: z.string().describe('From get_project_cycles'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; cycleId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      await this.plane.deleteCycle(args.projectId, args.cycleId, call);
      return { success: true, cycleId: args.cycleId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

@Injectable()
export class ListModulesTool implements ChatTool, OnModuleInit {
  readonly name = 'list_modules';
  readonly description =
    'List the modules of a ConqrPlan project. A module groups work items by feature or workstream, independently of cycles. Module ids are needed by update_work_item moduleIds.';
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
      return await this.plane.listModules(args.projectId, call);
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class ListModuleWorkItemsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_module_work_items';
  readonly description =
    'List the work items inside one ConqrPlan module — the basis for any "how is this workstream going" answer.';
  readonly parameters = z.object({
    projectId: z.string(),
    moduleId: z.string().describe('From list_modules'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; moduleId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      const items = await this.plane.listModuleWorkItems(
        args.projectId,
        args.moduleId,
        call,
      );
      return items.map((w) => ({
        id: w.id,
        name: w.name,
        sequenceId: w.sequence_id,
        state: w.state_detail?.name ?? w.state ?? null,
        priority: w.priority ?? null,
      }));
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class CreateModuleTool implements ChatTool, OnModuleInit {
  readonly name = 'create_module';
  readonly description =
    'Create a module in a ConqrPlan project. Put work items into it with update_work_item moduleIds, not here.';
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    status: z
      .enum(MODULE_STATUSES)
      .optional()
      .describe("Lifecycle of the module itself. ConqrPlan defaults to 'planned'."),
    startDate: isoDate.optional().describe('YYYY-MM-DD'),
    targetDate: isoDate.optional().describe('YYYY-MM-DD'),
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
    args: {
      projectId: string;
      name: string;
      description?: string;
      status?: (typeof MODULE_STATUSES)[number];
      startDate?: string;
      targetDate?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const mod = await this.plane.createModule(
        args.projectId,
        {
          name: args.name,
          description: args.description,
          status: args.status,
          start_date: args.startDate,
          target_date: args.targetDate,
        },
        call,
      );
      return {
        success: true,
        id: mod?.id,
        name: mod?.name ?? args.name,
        status: mod?.status ?? args.status ?? null,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateModuleTool implements ChatTool, OnModuleInit {
  readonly name = 'update_module';
  readonly description =
    'Rename a ConqrPlan module, move its dates, or change its status (backlog, planned, in-progress, paused, completed, cancelled). Send only what changes.';
  readonly parameters = z.object({
    projectId: z.string(),
    moduleId: z.string().describe('From list_modules'),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    status: z
      .enum(MODULE_STATUSES)
      .optional()
      .describe('Lifecycle of the module itself, not of its work items.'),
    startDate: isoDate.optional().describe('YYYY-MM-DD'),
    targetDate: isoDate.optional().describe('YYYY-MM-DD'),
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
    args: {
      projectId: string;
      moduleId: string;
      name?: string;
      description?: string;
      status?: (typeof MODULE_STATUSES)[number];
      startDate?: string;
      targetDate?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      const mod = await this.plane.updateModule(
        args.projectId,
        args.moduleId,
        {
          name: args.name,
          description: args.description,
          status: args.status,
          start_date: args.startDate,
          target_date: args.targetDate,
        },
        call,
      );
      return {
        success: true,
        id: mod?.id ?? args.moduleId,
        name: mod?.name,
        status: mod?.status ?? null,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteModuleTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_module';
  readonly description =
    'Delete a ConqrPlan module. The work items in it are not deleted; they end up with no module. Permanent.';
  readonly parameters = z.object({
    projectId: z.string(),
    moduleId: z.string().describe('From list_modules'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; moduleId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.projectConfigure,
    ]);
    try {
      await this.plane.deleteModule(args.projectId, args.moduleId, call);
      return { success: true, moduleId: args.moduleId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Estimation
// ---------------------------------------------------------------------------

@Injectable()
export class DeleteEstimateSystemTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_estimate_system';
  readonly description =
    "Delete a ConqrPlan project's estimation system. A project holds one system, so this is how you replace it: delete, then create_estimate_system. Work items keep their estimate ids but those ids no longer resolve to a value, so prefer activate_estimate_system when you only want to switch estimation off.";
  readonly parameters = z.object({
    projectId: z.string(),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [
      DELEGATED_SCOPES.estimateConfigure,
    ]);
    try {
      await this.plane.deleteEstimate(args.projectId, call);
      return { success: true, projectId: args.projectId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

@Injectable()
export class ListProjectMembersTool implements ChatTool, OnModuleInit {
  readonly name = 'list_project_members';
  readonly description =
    'List the members of one ConqrPlan project, with their roles. Narrower than list_conqrplan_members, which spans the whole workspace — use this to check who can actually be assigned work on a project.';
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
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.memberRead]);
    try {
      return await this.plane.listProjectMembers(args.projectId, call);
    } catch (err) {
      return planeError(err);
    }
  }
}

/** Registered as a group from the AI chat module. */
export const PLANE_CRUD_TOOLS = [
  DeleteWorkItemTool,
  UpdateWorkItemCommentTool,
  DeleteWorkItemCommentTool,
  CreateWorkItemLabelTool,
  UpdateWorkItemLabelTool,
  DeleteWorkItemLabelTool,
  CreateWorkItemStateTool,
  UpdateWorkItemStateTool,
  DeleteWorkItemStateTool,
  CreateCycleTool,
  UpdateCycleTool,
  DeleteCycleTool,
  ListModulesTool,
  ListModuleWorkItemsTool,
  CreateModuleTool,
  UpdateModuleTool,
  DeleteModuleTool,
  DeleteEstimateSystemTool,
  ListProjectMembersTool,
];
