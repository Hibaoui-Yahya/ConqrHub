import { PlaneApiError } from '../../../../core/integration/services/plane-client.service';
import { ChatToolRegistry } from './chat-tool.registry';
import { DELEGATED_SCOPES } from '../../../../core/integration/domain/delegated-token.util';
import {
  CreateProjectTool,
  GetProjectTool,
  GetProjectSummaryTool,
  UpdateProjectTool,
  ArchiveProjectTool,
  DeleteProjectTool,
  PLANE_PROJECT_TOOLS,
} from './plane-project.tools';

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

const PROJECT = {
  id: 'p1',
  name: 'Groupe Meloche',
  identifier: 'MELOCHE',
  description: 'Aeronautics',
  network: 2,
  project_lead: null,
  archived_at: null,
  created_at: '2026-09-18T00:00:00Z',
};

function makePlaneMock(enabled = true) {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    createProject: jest.fn().mockResolvedValue(PROJECT),
    getProject: jest.fn().mockResolvedValue(PROJECT),
    updateProject: jest.fn().mockResolvedValue({ ...PROJECT, name: 'Renamed' }),
    deleteProject: jest.fn().mockResolvedValue(undefined),
    archiveProject: jest.fn().mockResolvedValue(undefined),
    unarchiveProject: jest.fn().mockResolvedValue(undefined),
    getProjectSummary: jest.fn().mockResolvedValue({ total_issues: 12 }),
  };
}

describe('ConqrPlan project tools', () => {
  let registry: ChatToolRegistry;
  let delegation: any;

  beforeEach(() => {
    registry = new ChatToolRegistry();
    delegation = makeDelegation();
  });

  it('registers every tool only when the integration is enabled', () => {
    const on = PLANE_PROJECT_TOOLS.map((T: any) => new T(makePlaneMock(true), registry, delegation));
    on.forEach((t: any) => t.onModuleInit());
    expect(registry.getAll()).toHaveLength(PLANE_PROJECT_TOOLS.length);

    const off = new ChatToolRegistry();
    PLANE_PROJECT_TOOLS.map((T: any) => new T(makePlaneMock(false), off, delegation)).forEach(
      (t: any) => t.onModuleInit(),
    );
    expect(off.getAll()).toHaveLength(0);
  });

  describe('create_project', () => {
    it('uppercases the identifier and maps visibility to ConqrPlan numbers', async () => {
      const plane = makePlaneMock();
      const tool = new CreateProjectTool(plane as any, registry, delegation);
      const res: any = await tool.execute(
        { name: 'Groupe Meloche', identifier: 'meloche', visibility: 'secret' },
        ctx,
      );
      expect(plane.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'MELOCHE', network: 0 }),
        DELEGATED_CALL,
      );
      expect(res.success).toBe(true);
      expect(res.identifier).toBe('MELOCHE');
      expect(delegation.mintForPlane).toHaveBeenCalledWith(
        expect.objectContaining({ scope: [DELEGATED_SCOPES.projectCreate] }),
      );
    });

    it('reports visibility as a word rather than ConqrPlan’s number', async () => {
      const plane = makePlaneMock();
      plane.createProject.mockResolvedValue({ ...PROJECT, network: 0 });
      const tool = new CreateProjectTool(plane as any, registry, delegation);
      const res: any = await tool.execute({ name: 'X', identifier: 'X' }, ctx);
      expect(res.visibility).toBe('secret');
    });

    it('refuses characters ConqrPlan rejects, before spending a call', () => {
      const tool = new CreateProjectTool(makePlaneMock() as any, registry, delegation);
      // ConqrPlan reports these as a generic validation error, so catching
      // them in the schema is what makes the failure correctable.
      expect(tool.parameters.safeParse({ name: 'Ok', identifier: 'MEL-1' }).success).toBe(false);
      expect(tool.parameters.safeParse({ name: 'A & B', identifier: 'AB' }).success).toBe(false);
      expect(tool.parameters.safeParse({ name: 'Ok', identifier: 'MELOCHE' }).success).toBe(true);
    });

    it('rejects an identifier longer than ConqrPlan stores', () => {
      const tool = new CreateProjectTool(makePlaneMock() as any, registry, delegation);
      expect(
        tool.parameters.safeParse({ name: 'Ok', identifier: 'A'.repeat(13) }).success,
      ).toBe(false);
    });

    it('surfaces a duplicate identifier as a structured error', async () => {
      const plane = makePlaneMock();
      plane.createProject.mockRejectedValue(
        new PlaneApiError('Project Identifier is taken', 400, false),
      );
      const tool = new CreateProjectTool(plane as any, registry, delegation);
      const res: any = await tool.execute({ name: 'Ok', identifier: 'MELOCHE' }, ctx);
      expect(res.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('reads', () => {
    it('get_project returns a normalised record under a read scope', async () => {
      const plane = makePlaneMock();
      const res: any = await new GetProjectTool(plane as any, registry, delegation).execute(
        { projectId: 'p1' },
        ctx,
      );
      expect(res).toMatchObject({ id: 'p1', identifier: 'MELOCHE', visibility: 'public' });
      expect(delegation.mintForPlane).toHaveBeenCalledWith(
        expect.objectContaining({ scope: [DELEGATED_SCOPES.workItemRead] }),
      );
    });

    it('get_project_summary passes the project through', async () => {
      const plane = makePlaneMock();
      const res: any = await new GetProjectSummaryTool(
        plane as any,
        registry,
        delegation,
      ).execute({ projectId: 'p1' }, ctx);
      expect(plane.getProjectSummary).toHaveBeenCalledWith('p1', DELEGATED_CALL);
      expect(res).toEqual({ total_issues: 12 });
    });
  });

  describe('update_project', () => {
    it('sends only what changed and cannot change the identifier', async () => {
      const plane = makePlaneMock();
      const tool = new UpdateProjectTool(plane as any, registry, delegation);
      await tool.execute({ projectId: 'p1', name: 'Renamed' }, ctx);
      expect(plane.updateProject).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ name: 'Renamed' }),
        DELEGATED_CALL,
      );
      // The identifier is stamped on every existing work item, so it is not
      // even offered as a parameter.
      expect(
        Object.keys((tool.parameters as any).shape ?? {}).includes('identifier'),
      ).toBe(false);
    });
  });

  describe('archive_project', () => {
    it('archives by default and restores when asked', async () => {
      const plane = makePlaneMock();
      const tool = new ArchiveProjectTool(plane as any, registry, delegation);

      await tool.execute({ projectId: 'p1' }, ctx);
      expect(plane.archiveProject).toHaveBeenCalledWith('p1', DELEGATED_CALL);

      await tool.execute({ projectId: 'p1', archived: false }, ctx);
      expect(plane.unarchiveProject).toHaveBeenCalledWith('p1', DELEGATED_CALL);
    });
  });

  describe('delete_project', () => {
    it('refuses and deletes nothing when the confirmation does not match', async () => {
      const plane = makePlaneMock();
      const tool = new DeleteProjectTool(plane as any, registry, delegation);
      const res: any = await tool.execute(
        { projectId: 'p1', confirmIdentifier: 'WRONG' },
        ctx,
      );
      expect(res.code).toBe('VALIDATION_FAILED');
      expect(plane.deleteProject).not.toHaveBeenCalled();
    });

    it('checks the confirmation against ConqrPlan, not against the caller', async () => {
      const plane = makePlaneMock();
      const tool = new DeleteProjectTool(plane as any, registry, delegation);
      await tool.execute({ projectId: 'p1', confirmIdentifier: 'MELOCHE' }, ctx);
      expect(plane.getProject).toHaveBeenCalled();
      expect(plane.deleteProject).toHaveBeenCalledWith('p1', DELEGATED_CALL);
    });

    it('accepts the identifier in any case', async () => {
      const plane = makePlaneMock();
      const tool = new DeleteProjectTool(plane as any, registry, delegation);
      const res: any = await tool.execute(
        { projectId: 'p1', confirmIdentifier: '  meloche ' },
        ctx,
      );
      expect(res.success).toBe(true);
    });

    it('deletes under its own scope, not the configure scope', async () => {
      const plane = makePlaneMock();
      const tool = new DeleteProjectTool(plane as any, registry, delegation);
      await tool.execute({ projectId: 'p1', confirmIdentifier: 'MELOCHE' }, ctx);
      const scopes = delegation.mintForPlane.mock.calls.map((c: any[]) => c[0].scope);
      expect(scopes).toContainEqual([DELEGATED_SCOPES.projectDelete]);
    });

    it('says plainly that archiving is the safer option', () => {
      const tool = new DeleteProjectTool(makePlaneMock() as any, registry, delegation);
      expect(tool.description).toMatch(/archive_project/);
      expect(tool.description).toMatch(/cannot be undone/i);
    });
  });
});
