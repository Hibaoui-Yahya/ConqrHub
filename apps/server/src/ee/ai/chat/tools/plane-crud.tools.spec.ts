import { PlaneApiError } from '../../../../core/integration/services/plane-client.service';
import { ChatToolRegistry } from './chat-tool.registry';
import { DELEGATED_SCOPES } from '../../../../core/integration/domain/delegated-token.util';
import {
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
  ListProjectMembersTool,
  PLANE_CRUD_TOOLS,
} from './plane-crud.tools';

/** Mints a predictable token so tests can assert the scope that was asked for. */
function makeDelegation() {
  return {
    mintForPlane: jest.fn().mockImplementation(({ scope }: { scope: string[] }) => ({
      token: 'obo-token',
      jti: 'corr-1',
      personUid: 'conqr:person:user-1',
      orgUid: 'conqr:org:ws-1',
      scope,
      expiresAt: 9_999_999,
    })),
  } as any;
}

const DELEGATED_CALL = { delegation: 'obo-token', correlationId: 'corr-1' };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

function makePlaneMock(enabled = true) {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    deleteWorkItem: jest.fn().mockResolvedValue(undefined),
    updateWorkItemComment: jest.fn().mockResolvedValue({ id: 'c1' }),
    deleteWorkItemComment: jest.fn().mockResolvedValue(undefined),
    createLabel: jest.fn().mockResolvedValue({ id: 'l1', name: 'Bug' }),
    updateLabel: jest.fn().mockResolvedValue({ id: 'l1', name: 'Defect' }),
    deleteLabel: jest.fn().mockResolvedValue(undefined),
    createState: jest.fn().mockResolvedValue({ id: 's1', name: 'Review', group: 'started' }),
    updateState: jest.fn().mockResolvedValue({ id: 's1', name: 'In Review' }),
    deleteState: jest.fn().mockResolvedValue(undefined),
    createCycle: jest.fn().mockResolvedValue({ id: 'cy1', name: 'Sprint 1' }),
    updateCycle: jest.fn().mockResolvedValue({ id: 'cy1', name: 'Sprint 2' }),
    deleteCycle: jest.fn().mockResolvedValue(undefined),
    listModules: jest.fn().mockResolvedValue([{ id: 'm1', name: 'Onboarding' }]),
    listModuleWorkItems: jest
      .fn()
      .mockResolvedValue([
        { id: 'wi1', name: 'Task', sequence_id: 3, state_detail: { name: 'Done' } },
      ]),
    createModule: jest.fn().mockResolvedValue({ id: 'm1', name: 'Onboarding' }),
    updateModule: jest.fn().mockResolvedValue({ id: 'm1', name: 'Onboarding v2' }),
    deleteModule: jest.fn().mockResolvedValue(undefined),
    listProjectMembers: jest.fn().mockResolvedValue([{ id: 'u1', display_name: 'Ada' }]),
  };
}

function build(plane: any, registry: ChatToolRegistry, delegation: any) {
  return PLANE_CRUD_TOOLS.map((T: any) => new T(plane, registry, delegation));
}

describe('ConqrPlan CRUD tools', () => {
  let registry: ChatToolRegistry;
  let delegation: any;

  beforeEach(() => {
    registry = new ChatToolRegistry();
    delegation = makeDelegation();
  });

  it('registers every tool when the integration is enabled', () => {
    const plane = makePlaneMock(true);
    build(plane, registry, delegation).forEach((t: any) => t.onModuleInit());
    expect(registry.getAll()).toHaveLength(PLANE_CRUD_TOOLS.length);
  });

  it('registers nothing when the integration is disabled', () => {
    const plane = makePlaneMock(false);
    build(plane, registry, delegation).forEach((t: any) => t.onModuleInit());
    expect(registry.getAll()).toHaveLength(0);
  });

  it('exposes unique snake_case tool names', () => {
    const plane = makePlaneMock(true);
    const names = build(plane, registry, delegation).map((t: any) => t.name);
    expect(new Set(names).size).toBe(names.length);
    names.forEach((n: string) => expect(n).toMatch(/^[a-z][a-z0-9_]*$/));
  });

  describe('delete_work_item', () => {
    it('deletes under a dedicated delete scope, not the update scope', async () => {
      const plane = makePlaneMock();
      const tool = new DeleteWorkItemTool(plane as any, registry, delegation);
      const res: any = await tool.execute(
        { projectId: 'p1', workItemId: 'wi1' },
        ctx,
      );
      expect(plane.deleteWorkItem).toHaveBeenCalledWith('p1', 'wi1', DELEGATED_CALL);
      expect(res).toEqual({ success: true, workItemId: 'wi1', deleted: true });
      expect(delegation.mintForPlane).toHaveBeenCalledWith(
        expect.objectContaining({ scope: [DELEGATED_SCOPES.workItemDelete] }),
      );
    });

    it('returns a structured error instead of throwing', async () => {
      const plane = makePlaneMock();
      plane.deleteWorkItem.mockRejectedValue(
        new PlaneApiError('Not found: /issues/wi1/', 404, false),
      );
      const tool = new DeleteWorkItemTool(plane as any, registry, delegation);
      const res: any = await tool.execute({ projectId: 'p1', workItemId: 'wi1' }, ctx);
      expect(res.code).toBe('NOT_FOUND');
      expect(res.error).toBeDefined();
    });

    it('warns in its description that the delete cannot be undone', () => {
      const tool = new DeleteWorkItemTool(makePlaneMock() as any, registry, delegation);
      expect(tool.description).toMatch(/cannot be undone/i);
    });
  });

  describe('work-item comments', () => {
    it('wraps bare text in a paragraph and leaves html alone', async () => {
      const plane = makePlaneMock();
      const tool = new UpdateWorkItemCommentTool(plane as any, registry, delegation);

      await tool.execute(
        { projectId: 'p1', workItemId: 'wi1', commentId: 'c1', text: 'plain' },
        ctx,
      );
      expect(plane.updateWorkItemComment).toHaveBeenLastCalledWith(
        'p1',
        'wi1',
        'c1',
        '<p>plain</p>',
        DELEGATED_CALL,
      );

      await tool.execute(
        { projectId: 'p1', workItemId: 'wi1', commentId: 'c1', text: '<p>rich</p>' },
        ctx,
      );
      expect(plane.updateWorkItemComment).toHaveBeenLastCalledWith(
        'p1',
        'wi1',
        'c1',
        '<p>rich</p>',
        DELEGATED_CALL,
      );
    });

    it('deletes a comment under the comment scope', async () => {
      const plane = makePlaneMock();
      const tool = new DeleteWorkItemCommentTool(plane as any, registry, delegation);
      const res: any = await tool.execute(
        { projectId: 'p1', workItemId: 'wi1', commentId: 'c1' },
        ctx,
      );
      expect(res).toEqual({ success: true, commentId: 'c1', deleted: true });
      expect(delegation.mintForPlane).toHaveBeenCalledWith(
        expect.objectContaining({ scope: [DELEGATED_SCOPES.commentWrite] }),
      );
    });
  });

  describe('labels, states, cycles and modules', () => {
    it('creates a label and returns its id', async () => {
      const plane = makePlaneMock();
      const tool = new CreateWorkItemLabelTool(plane as any, registry, delegation);
      const res: any = await tool.execute(
        { projectId: 'p1', name: 'Bug', color: '#ff0000' },
        ctx,
      );
      expect(res).toEqual({ success: true, id: 'l1', name: 'Bug' });
    });

    it('rejects a colour that is not hex before calling ConqrPlan', () => {
      const tool = new CreateWorkItemLabelTool(makePlaneMock() as any, registry, delegation);
      const parsed = tool.parameters.safeParse({
        projectId: 'p1',
        name: 'Bug',
        color: 'red',
      });
      expect(parsed.success).toBe(false);
    });

    it('constrains a state to ConqrPlan’s reporting groups', () => {
      const tool = new CreateWorkItemStateTool(makePlaneMock() as any, registry, delegation);
      expect(
        tool.parameters.safeParse({ projectId: 'p1', name: 'X', group: 'started' })
          .success,
      ).toBe(true);
      expect(
        tool.parameters.safeParse({ projectId: 'p1', name: 'X', group: 'wip' }).success,
      ).toBe(false);
    });

    it('rejects a date that is not YYYY-MM-DD', () => {
      const tool = new CreateCycleTool(makePlaneMock() as any, registry, delegation);
      expect(
        tool.parameters.safeParse({
          projectId: 'p1',
          name: 'S1',
          startDate: '01/02/2026',
          endDate: '2026-02-14',
        }).success,
      ).toBe(false);
      expect(
        tool.parameters.safeParse({
          projectId: 'p1',
          name: 'S1',
          startDate: '2026-02-01',
          endDate: '2026-02-14',
        }).success,
      ).toBe(true);
    });

    it('refuses half a cycle date range before calling ConqrPlan', () => {
      // ConqrPlan rejects one end without the other; catching it in the schema
      // gives the model something it can correct.
      const tool = new CreateCycleTool(makePlaneMock() as any, registry, delegation);
      expect(
        tool.parameters.safeParse({ projectId: 'p1', name: 'S1', startDate: '2026-02-01' })
          .success,
      ).toBe(false);
      expect(
        tool.parameters.safeParse({ projectId: 'p1', name: 'S1', endDate: '2026-02-14' })
          .success,
      ).toBe(false);
      // Neither is fine: an undated cycle is legal.
      expect(tool.parameters.safeParse({ projectId: 'p1', name: 'S1' }).success).toBe(true);
    });

    it('maps cycle dates onto ConqrPlan’s snake_case body', async () => {
      const plane = makePlaneMock();
      const tool = new CreateCycleTool(plane as any, registry, delegation);
      await tool.execute(
        { projectId: 'p1', name: 'S1', startDate: '2026-02-01', endDate: '2026-02-14' },
        ctx,
      );
      expect(plane.createCycle).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ start_date: '2026-02-01', end_date: '2026-02-14' }),
        DELEGATED_CALL,
      );
    });

    it('says plainly that deleting a cycle keeps its work items', () => {
      const tool = new DeleteCycleTool(makePlaneMock() as any, registry, delegation);
      expect(tool.description).toMatch(/not deleted/i);
    });

    it('shapes module work items like the other work-item readers', async () => {
      const plane = makePlaneMock();
      const tool = new ListModuleWorkItemsTool(plane as any, registry, delegation);
      const res: any = await tool.execute({ projectId: 'p1', moduleId: 'm1' }, ctx);
      expect(res).toEqual([
        { id: 'wi1', name: 'Task', sequenceId: 3, state: 'Done', priority: null },
      ]);
    });

    it('reads modules and project members under read-only scopes', async () => {
      const plane = makePlaneMock();
      await new ListModulesTool(plane as any, registry, delegation).execute(
        { projectId: 'p1' },
        ctx,
      );
      expect(delegation.mintForPlane).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: [DELEGATED_SCOPES.workItemRead] }),
      );

      await new ListProjectMembersTool(plane as any, registry, delegation).execute(
        { projectId: 'p1' },
        ctx,
      );
      expect(delegation.mintForPlane).toHaveBeenLastCalledWith(
        expect.objectContaining({ scope: [DELEGATED_SCOPES.memberRead] }),
      );
    });

    it('configures project shape under one configure scope', async () => {
      const plane = makePlaneMock();
      const configTools: any[] = [
        new UpdateWorkItemLabelTool(plane as any, registry, delegation),
        new DeleteWorkItemLabelTool(plane as any, registry, delegation),
        new UpdateWorkItemStateTool(plane as any, registry, delegation),
        new DeleteWorkItemStateTool(plane as any, registry, delegation),
        new UpdateCycleTool(plane as any, registry, delegation),
        new CreateModuleTool(plane as any, registry, delegation),
        new UpdateModuleTool(plane as any, registry, delegation),
        new DeleteModuleTool(plane as any, registry, delegation),
      ];
      for (const t of configTools) {
        await t.execute(
          {
            projectId: 'p1',
            labelId: 'l1',
            stateId: 's1',
            cycleId: 'cy1',
            moduleId: 'm1',
            name: 'x',
          },
          ctx,
        );
      }
      const scopes = delegation.mintForPlane.mock.calls.map((c: any[]) => c[0].scope);
      expect(scopes.every((s: string[]) => s[0] === DELEGATED_SCOPES.projectConfigure)).toBe(
        true,
      );
    });
  });
});
