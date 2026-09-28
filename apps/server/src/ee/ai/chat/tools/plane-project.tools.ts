import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { PlaneClientService } from '../../../../core/integration/services/plane-client.service';
import { ChatTool, ChatToolContext } from './chat-tool.types';
import { ChatToolRegistry } from './chat-tool.registry';
import { fail, planeError } from './work-item-fields';
import { DELEGATED_SCOPES } from '../../../../core/integration/domain/delegated-token.util';
import { DelegatedTokenService } from '../../../../core/integration/services/delegated-token.service';
import { delegateForPlane } from './plane-delegation.helper';

/**
 * Project lifecycle.
 *
 * The project is the container every other ConqrPlan object lives in, and it
 * was the one thing the tool surface could not make. An agent could create
 * work items, cycles, modules, labels and states, but only inside a project
 * somebody had already made by hand — so "set this new client up" failed at
 * the first step.
 *
 * Each tool declares its own constructor: TypeScript only emits the
 * parameter metadata Nest injects from on a class that has one.
 */

/**
 * ConqrPlan rejects these characters in a project name or identifier, and
 * reports it as a generic validation error. Mirroring the rule here turns
 * that into something the model can correct before spending a call.
 */
const FORBIDDEN_CHARS = /[&+,:;$^}{*=?@#|'<>.()%!-]/;

const projectName = z
  .string()
  .min(1)
  .max(255)
  .refine((v) => !FORBIDDEN_CHARS.test(v), {
    message: "Project names cannot contain special characters such as & + , : ; @ # ( ) or -",
  });

/**
 * The short key stamped on every work item, as in MELOCHE-142. Uppercased by
 * ConqrPlan on save, and unique per workspace.
 */
const projectIdentifier = z
  .string()
  .min(1)
  .max(12)
  .refine((v) => !FORBIDDEN_CHARS.test(v), {
    message: "Project identifiers cannot contain special characters such as & + , : ; @ # ( ) or -",
  });

/** ConqrPlan stores visibility as a number. Named here so the model need not guess. */
const VISIBILITY = { secret: 0, public: 2 } as const;
const visibility = z
  .enum(['secret', 'public'])
  .describe(
    "'public' is visible to the whole workspace; 'secret' only to its members. ConqrPlan defaults to public.",
  );

const projectSummary = (p: any) => ({
  id: p?.id,
  name: p?.name,
  identifier: p?.identifier ?? null,
  description: p?.description ?? null,
  visibility: p?.network === VISIBILITY.secret ? 'secret' : 'public',
  projectLead: p?.project_lead ?? null,
  archivedAt: p?.archived_at ?? null,
  createdAt: p?.created_at ?? null,
});

@Injectable()
export class CreateProjectTool implements ChatTool, OnModuleInit {
  readonly name = 'create_project';
  readonly description =
    'Create a project in ConqrPlan. A project is the container for work items, cycles, modules, labels and states, so this is the first step when setting up new work. The identifier is the short key stamped on every work item (MELOCHE-142); it is uppercased and must be unique in the workspace. Creating a project also seeds its default workflow states and makes you its admin. Use only when the user explicitly asks for a new project.';
  readonly parameters = z.object({
    name: projectName.describe("The project's display name"),
    identifier: projectIdentifier.describe(
      'Short key for work items, up to 12 characters, letters and digits only (e.g. MELOCHE)',
    ),
    description: z.string().max(2000).optional(),
    visibility: visibility.optional(),
    projectLeadId: z
      .string()
      .optional()
      .describe('A workspace member id from list_conqrplan_members. Must be an active member.'),
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
      name: string;
      identifier: string;
      description?: string;
      visibility?: 'secret' | 'public';
      projectLeadId?: string;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectCreate]);
    try {
      const project = await this.plane.createProject(
        {
          name: args.name,
          identifier: args.identifier.trim().toUpperCase(),
          description: args.description,
          network: args.visibility ? VISIBILITY[args.visibility] : undefined,
          project_lead: args.projectLeadId,
        },
        call,
      );
      return { success: true, ...projectSummary(project) };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class GetProjectTool implements ChatTool, OnModuleInit {
  readonly name = 'get_project';
  readonly description =
    'Read one ConqrPlan project: its name, identifier, description, visibility, lead and whether it is archived. Use get_project_summary for its work counts.';
  readonly parameters = z.object({
    projectId: z.string().describe('From list_conqrplan_projects'),
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
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      return projectSummary(await this.plane.getProject(args.projectId, call));
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class GetProjectSummaryTool implements ChatTool, OnModuleInit {
  readonly name = 'get_project_summary';
  readonly description =
    "A ConqrPlan project's headline numbers in one call — work item counts by state, members, cycles and modules. Use this for \"how is this project going\" instead of counting list_cycle_work_items yourself.";
  readonly parameters = z.object({
    projectId: z.string().describe('From list_conqrplan_projects'),
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
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    try {
      return await this.plane.getProjectSummary(args.projectId, call);
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class UpdateProjectTool implements ChatTool, OnModuleInit {
  readonly name = 'update_project';
  readonly description =
    "Update a ConqrPlan project's name, description, visibility or lead. Send only what changes. The identifier cannot be changed after creation, because it is stamped on every existing work item.";
  readonly parameters = z.object({
    projectId: z.string().describe('From list_conqrplan_projects'),
    name: projectName.optional(),
    description: z.string().max(2000).optional(),
    visibility: visibility.optional(),
    projectLeadId: z
      .string()
      .nullable()
      .optional()
      .describe('A workspace member id, or null to clear the lead'),
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
      name?: string;
      description?: string;
      visibility?: 'secret' | 'public';
      projectLeadId?: string | null;
    },
    ctx: ChatToolContext,
  ) {
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      const project = await this.plane.updateProject(
        args.projectId,
        {
          name: args.name,
          description: args.description,
          network: args.visibility ? VISIBILITY[args.visibility] : undefined,
          project_lead: args.projectLeadId,
        },
        call,
      );
      return { success: true, ...projectSummary(project) };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class ArchiveProjectTool implements ChatTool, OnModuleInit {
  readonly name = 'archive_project';
  readonly description =
    'Archive a ConqrPlan project, or bring it back. Archiving hides it from the active project list and keeps everything inside it, so prefer this over delete_project for work that is simply finished.';
  readonly parameters = z.object({
    projectId: z.string().describe('From list_conqrplan_projects'),
    archived: z
      .boolean()
      .optional()
      .default(true)
      .describe('true archives the project, false restores it'),
  });
  constructor(
    private readonly plane: PlaneClientService,
    private readonly registry: ChatToolRegistry,
    private readonly delegation: DelegatedTokenService,
  ) {}
  onModuleInit(): void {
    if (this.plane.isEnabled()) this.registry.register(this);
  }
  async execute(args: { projectId: string; archived?: boolean }, ctx: ChatToolContext) {
    const archived = args.archived ?? true;
    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectConfigure]);
    try {
      if (archived) await this.plane.archiveProject(args.projectId, call);
      else await this.plane.unarchiveProject(args.projectId, call);
      return { success: true, projectId: args.projectId, archived };
    } catch (err) {
      return planeError(err);
    }
  }
}

@Injectable()
export class DeleteProjectTool implements ChatTool, OnModuleInit {
  readonly name = 'delete_project';
  readonly description =
    'Permanently delete a ConqrPlan project AND every work item, cycle, module, label and comment inside it. This cannot be undone and there is no trash. Almost always the wrong tool: archive_project keeps the contents and hides the project. You must pass confirmIdentifier matching the project\'s own identifier, so read it with get_project first. Use only when the user has explicitly asked to delete this specific project and its contents.';
  readonly parameters = z.object({
    projectId: z.string().describe('From list_conqrplan_projects'),
    confirmIdentifier: z
      .string()
      .describe(
        "The project's identifier exactly as get_project reports it. Guards against deleting the wrong project.",
      ),
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
    args: { projectId: string; confirmIdentifier: string },
    ctx: ChatToolContext,
  ) {
    // Read first, under a read scope, so the confirmation is checked against
    // what ConqrPlan actually holds rather than against the caller's belief.
    const readCall = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.workItemRead]);
    let project;
    try {
      project = await this.plane.getProject(args.projectId, readCall);
    } catch (err) {
      return planeError(err);
    }

    const expected = (project?.identifier ?? '').trim().toUpperCase();
    if (!expected || args.confirmIdentifier.trim().toUpperCase() !== expected) {
      return fail(
        'VALIDATION_FAILED',
        `confirmIdentifier "${args.confirmIdentifier}" does not match project ${args.projectId} (identifier "${project?.identifier ?? 'unknown'}"). Read it with get_project and pass it exactly. Nothing was deleted.`,
        { field: 'confirmIdentifier' },
      );
    }

    const call = delegateForPlane(this.delegation, ctx, [DELEGATED_SCOPES.projectDelete]);
    try {
      await this.plane.deleteProject(args.projectId, call);
      return {
        success: true,
        projectId: args.projectId,
        identifier: expected,
        deleted: true,
      };
    } catch (err) {
      return planeError(err);
    }
  }
}

/** Registered as a group from the AI chat module. */
export const PLANE_PROJECT_TOOLS = [
  CreateProjectTool,
  GetProjectTool,
  GetProjectSummaryTool,
  UpdateProjectTool,
  ArchiveProjectTool,
  DeleteProjectTool,
];
