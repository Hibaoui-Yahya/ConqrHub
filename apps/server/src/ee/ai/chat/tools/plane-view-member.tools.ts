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
 * Saved views and project membership.
 *
 * Views are the named filters a team actually works through ("my open bugs",
 * "this release"), and they were reachable only from ConqrPlan's
 * session-authenticated app API — invisible to anything holding an API key.
 * The public endpoint behind these tools is new.
 *
 * Membership answers "who can this be assigned to", which the assistant has
 * to know before it puts anyone's name on a work item.
 */

/** ConqrPlan stores a project role as a number. */
const ROLE = { admin: 20, member: 15, guest: 5 } as const;
const roleName = (n?: number) =>
  n === ROLE.admin ? 'admin' : n === ROLE.member ? 'member' : n === ROLE.guest ? 'guest' : null;

/** 0 private, 1 public — IssueView.access. */
const ACCESS = { private: 0, project: 1 } as const;

const viewSummary = (v: any) => ({
  id: v?.id,
  name: v?.name,
  description: v?.description ?? null,
  visibility: v?.access === ACCESS.private ? 'private' : 'project',
  locked: !!v?.is_locked,
  filters: v?.filters ?? {},
  displayFilters: v?.display_filters ?? {},
  ownedBy: v?.owned_by ?? null,
  createdAt: v?.created_at ?? null,
});

const viewFilters = z
  .record(z.string(), z.unknown())
  .optional()
  .describe(
    'The saved query, in ConqrPlan’s own filter shape, e.g. {"state_group":["started"],"priority":["urgent"]}. Read an existing view with get_view to copy the shape before inventing one.',
  );

@Injectable()
export class ListViewsTool implements ChatTool, OnModuleInit {
  readonly name = 'list_views';
  readonly description =
    "List a ConqrPlan project's saved views: the named filters the team works through, such as \"my open bugs\" or \"this release\". Returns public views plus your own private ones.";
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
      return (await this.plane.listViews(args.projectId, call)).map(viewSummary);
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class GetViewTool implements ChatTool, OnModuleInit {
  readonly name = 'get_view';
  readonly description =
    'Read one saved ConqrPlan view, including its saved filters. Use this to copy an existing view’s filter shape before creating a similar one.';
  readonly parameters = z.object({
    projectId: z.string(),
    viewId: z.string().describe('From list_views'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; viewId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      return viewSummary(await this.plane.getView(args.projectId, args.viewId, call));
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class CreateViewTool implements ChatTool, OnModuleInit {
  readonly name = 'create_view';
  readonly description =
    "Create a saved view in a ConqrPlan project: a named filter over its work items that the whole project can use. You become its owner. Set visibility to 'private' to keep it to yourself.";
  readonly parameters = z.object({
    projectId: z.string(),
    name: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    filters: viewFilters,
    visibility: z
      .enum(['project', 'private'])
      .optional()
      .describe("'project' is visible to everyone in the project; 'private' only to you."),
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
      filters?: Record<string, unknown>;
      visibility?: 'project' | 'private';
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      const view = await this.plane.createView(
        args.projectId,
        {
          name: args.name,
          description: args.description,
          filters: args.filters,
          access: args.visibility ? ACCESS[args.visibility] : undefined,
        },
        call,
      );
      return { success: true, ...viewSummary(view) };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateViewTool implements ChatTool, OnModuleInit {
  readonly name = 'update_view';
  readonly description =
    'Update a saved ConqrPlan view: rename it, change its filters, or change who can see it. Send only what changes. A locked view is refused.';
  readonly parameters = z.object({
    projectId: z.string(),
    viewId: z.string().describe('From list_views'),
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2000).optional(),
    filters: viewFilters,
    visibility: z.enum(['project', 'private']).optional(),
    locked: z
      .boolean()
      .optional()
      .describe('Lock the view so it cannot be edited, or unlock it'),
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
      viewId: string;
      name?: string;
      description?: string;
      filters?: Record<string, unknown>;
      visibility?: 'project' | 'private';
      locked?: boolean;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      const view = await this.plane.updateView(
        args.projectId,
        args.viewId,
        {
          name: args.name,
          description: args.description,
          filters: args.filters,
          access: args.visibility ? ACCESS[args.visibility] : undefined,
          is_locked: args.locked,
        },
        call,
      );
      return { success: true, ...viewSummary(view) };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteViewTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_view';
  readonly description =
    'Delete a saved ConqrPlan view. Only its owner may delete it. The work items it filtered are untouched — a view is only a saved query.';
  readonly parameters = z.object({
    projectId: z.string(),
    viewId: z.string().describe('From list_views'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; viewId: string }, ctx: ChatToolContext) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      await this.plane.deleteView(args.projectId, args.viewId, call);
      return { success: true, viewId: args.viewId, deleted: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Project membership
// ---------------------------------------------------------------------------

@Injectable()
export class AddProjectMemberTool implements ChatTool, OnModuleInit {
  readonly name = 'add_project_member';
  readonly description =
    'Add someone to a ConqrPlan project so work can be assigned to them. They must already be a member of the workspace — get their id from list_conqrplan_members. Roles: admin can configure the project, member can work in it, guest is read-mostly.';
  readonly parameters = z.object({
    projectId: z.string(),
    memberId: z
      .string()
      .describe('The workspace member id from list_conqrplan_members, not their email'),
    role: z
      .enum(['admin', 'member', 'guest'])
      .optional()
      .default('member')
      .describe('ConqrPlan defaults new members to guest; this tool defaults to member.'),
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
    args: { projectId: string; memberId: string; role?: 'admin' | 'member' | 'guest' },
    ctx: ChatToolContext,
  ) {
    const role = args.role ?? 'member';
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      const rec = await this.plane.addProjectMember(
        args.projectId,
        { member: args.memberId, role: ROLE[role] },
        call,
      );
      return {
        success: true,
        // The id of the membership record, which is what update and remove
        // take — not the person's own id.
        projectMemberId: rec?.id,
        memberId: args.memberId,
        role,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateProjectMemberRoleTool implements ChatTool, OnModuleInit {
  readonly name = 'update_project_member_role';
  readonly description =
    "Change someone's role on a ConqrPlan project. Takes the membership record id from list_project_members, not the person's own id.";
  readonly parameters = z.object({
    projectId: z.string(),
    projectMemberId: z
      .string()
      .describe('The membership record id from list_project_members'),
    role: z.enum(['admin', 'member', 'guest']),
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
    args: { projectId: string; projectMemberId: string; role: 'admin' | 'member' | 'guest' },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      const rec = await this.plane.updateProjectMemberRole(
        args.projectId,
        args.projectMemberId,
        ROLE[args.role],
        call,
      );
      return {
        success: true,
        projectMemberId: args.projectMemberId,
        role: roleName(rec?.role) ?? args.role,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class RemoveProjectMemberTool implements ChatTool, OnModuleInit {
  readonly name = 'remove_project_member';
  readonly description =
    'Remove someone from a ConqrPlan project. Their work items stay and keep their name on them; they simply lose access and can no longer be assigned new work. Takes the membership record id from list_project_members.';
  readonly parameters = z.object({
    projectId: z.string(),
    projectMemberId: z
      .string()
      .describe('The membership record id from list_project_members'),
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
    args: { projectId: string; projectMemberId: string },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      await this.plane.removeProjectMember(args.projectId, args.projectMemberId, call);
      return { success: true, projectMemberId: args.projectMemberId, removed: true };
    } catch (err) {
      return planeError(err);
    }
  }
}

/** Registered as a group from the AI chat module. */
export const PLANE_VIEW_MEMBER_TOOLS = [
  ListViewsTool,
  GetViewTool,
  CreateViewTool,
  UpdateViewTool,
  DeleteViewTool,
  AddProjectMemberTool,
  UpdateProjectMemberRoleTool,
  RemoveProjectMemberTool,
];
