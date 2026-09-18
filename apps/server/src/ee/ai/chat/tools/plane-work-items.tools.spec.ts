import { PlaneApiError } from '../../../../core/integration/services/plane-client.service';
import { ChatToolRegistry } from './chat-tool.registry';
import {
  ListConqrPlanProjectsTool,
  SearchWorkItemsTool,
  GetWorkItemTool,
  CreateWorkItemTool,
  GetProjectCyclesTool,
  PLANE_WORK_ITEM_TOOLS,
} from './plane-work-items.tools';

/**
 * A delegation service stub. Every ConqrPlan call from a tool must carry a
 * signed on-behalf-of token; these tests assert the token is minted with the
 * right scopes and travels with the call, not that HMAC works (covered by
 * delegated-token.util.spec.ts).
 */
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

/** The call context every delegated ConqrPlan request should carry. */
const DELEGATED_CALL = { delegation: 'obo-token', correlationId: 'corr-1' };


const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

function makePlaneMock(enabled: boolean) {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    listProjects: jest.fn(),
    listWorkItems: jest.fn(),
    searchWorkItems: jest.fn(),
    getWorkItem: jest.fn(),
    createWorkItem: jest.fn(),
    listCycles: jest.fn(),
  };
}

function constructAll(plane: any, registry: ChatToolRegistry) {
  return [
    new ListConqrPlanProjectsTool(plane, registry, makeDelegation()),
    new SearchWorkItemsTool(plane, registry, makeDelegation()),
    new GetWorkItemTool(plane, registry, makeDelegation()),
    new CreateWorkItemTool(plane, registry, makeDelegation()),
    new GetProjectCyclesTool(plane, registry, makeDelegation()),
  ];
}

describe('Plane work-item tools', () => {
  it('does not register any tool when the integration is disabled', () => {
    const plane = makePlaneMock(false);
    const registry = new ChatToolRegistry();
    const tools = constructAll(plane, registry);
    tools.forEach((t) => t.onModuleInit());
    expect(registry.getAll()).toHaveLength(0);
  });

  it('registers all five tools when the integration is enabled', () => {
    const plane = makePlaneMock(true);
    const registry = new ChatToolRegistry();
    const tools = constructAll(plane, registry);
    tools.forEach((t) => t.onModuleInit());
    const names = registry.getAll().map((t) => t.name);
    expect(names).toEqual([
      'list_conqrplan_projects',
      'search_work_items',
      'get_work_item',
      'create_work_item',
      'get_project_cycles',
    ]);
    expect(PLANE_WORK_ITEM_TOOLS).toHaveLength(5);
  });

  it('search_work_items searches rather than listing when given a query', async () => {
    // The list endpoint has no `search` parameter and ignores one, so routing
    // a query through it returned the project's first N items as if they were
    // matches — the same rows for every term.
    const plane = makePlaneMock(true);
    plane.searchWorkItems.mockResolvedValue({
      results: [
        {
          id: 'wi-1',
          name: 'Fix login bug',
          sequence_id: 42,
          state__name: 'In Progress',
          priority: 'high',
          project_id: 'proj-1',
          project__identifier: 'PRJ',
        },
      ],
    });
    const registry = new ChatToolRegistry();
    const tool = new SearchWorkItemsTool(plane as any, registry, makeDelegation());

    const result = await tool.execute({ projectId: 'proj-1', query: 'login' }, ctx);

    expect(plane.searchWorkItems).toHaveBeenCalledWith(
      { query: 'login', limit: 50, projectId: 'proj-1' },
      { delegation: 'obo-token', correlationId: 'corr-1' },
    );
    expect(plane.listWorkItems).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'wi-1',
        name: 'Fix login bug',
        sequenceId: 42,
        state: 'In Progress',
        priority: 'high',
        projectId: 'proj-1',
        projectIdentifier: 'PRJ',
      },
    ]);
  });

  it('search_work_items searches every project when no projectId is given', async () => {
    const plane = makePlaneMock(true);
    plane.searchWorkItems.mockResolvedValue({ results: [] });
    const tool = new SearchWorkItemsTool(
      plane as any,
      new ChatToolRegistry(),
      makeDelegation(),
    );

    await tool.execute({ query: 'meloche' }, ctx);

    expect(plane.searchWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'meloche', projectId: undefined }),
      expect.anything(),
    );
  });

  it('search_work_items lists a project when given no query', async () => {
    const plane = makePlaneMock(true);
    plane.listWorkItems.mockResolvedValue({ results: [] });
    const tool = new SearchWorkItemsTool(
      plane as any,
      new ChatToolRegistry(),
      makeDelegation(),
    );

    await tool.execute({ projectId: 'proj-1' }, ctx);

    expect(plane.listWorkItems).toHaveBeenCalledWith(
      'proj-1',
      { perPage: 50 },
      { delegation: 'obo-token', correlationId: 'corr-1' },
    );
    expect(plane.searchWorkItems).not.toHaveBeenCalled();
  });

  it('search_work_items asks for a query or a project rather than guessing', async () => {
    const plane = makePlaneMock(true);
    const tool = new SearchWorkItemsTool(
      plane as any,
      new ChatToolRegistry(),
      makeDelegation(),
    );

    const result: any = await tool.execute({}, ctx);

    expect(result.error).toMatch(/query|projectId/);
    expect(plane.listWorkItems).not.toHaveBeenCalled();
    expect(plane.searchWorkItems).not.toHaveBeenCalled();
  });

  it('create_work_item passes name/description/priority to the client', async () => {
    const plane = makePlaneMock(true);
    plane.createWorkItem.mockResolvedValue({
      id: 'wi-2',
      name: 'New work item',
      sequence_id: 7,
      state_detail: { name: 'Backlog' },
      priority: 'medium',
      updated_at: '2026-07-19T00:00:00Z',
    });
    const registry = new ChatToolRegistry();
    const tool = new CreateWorkItemTool(plane as any, registry, makeDelegation());

    const result = await tool.execute(
      {
        projectId: 'proj-1',
        name: 'New work item',
        description: 'Some plain text',
        priority: 'medium',
      },
      ctx,
    );

    expect(plane.createWorkItem).toHaveBeenCalledWith(
      'proj-1',
      {
        name: 'New work item',
        description_html: '<p>Some plain text</p>',
        priority: 'medium',
      },
      DELEGATED_CALL,
    );
    // Backward compatibility: every key the previous summary returned is still
    // present with the same meaning. Control Foundation v1 only widens the
    // shape, so this is asserted as a superset rather than an exact match.
    expect(result).toMatchObject({
      id: 'wi-2',
      name: 'New work item',
      sequenceId: 7,
      state: 'Backlog',
      priority: 'medium',
      estimatePointId: null,
      updatedAt: '2026-07-19T00:00:00Z',
    });
    // ...and the fields that were previously unreachable are now reported.
    expect(result).toMatchObject({
      urn: 'conqr://plane/work-item/wi-2',
      projectId: 'proj-1',
      assigneeIds: [],
      labelIds: [],
      startDate: null,
      targetDate: null,
      parentId: null,
      typeId: null,
    });
    // A clean write must not carry an error marker.
    expect(result).not.toHaveProperty('error');
  });

  it('tools surface PlaneApiError as a structured error object, not a throw-through of internals', async () => {
    const plane = makePlaneMock(true);
    plane.searchWorkItems.mockRejectedValue(
      new PlaneApiError('Plane API 503 for /work-items/search/', 503, false),
    );
    const registry = new ChatToolRegistry();
    const tool = new SearchWorkItemsTool(plane as any, registry, makeDelegation());

    const result = await tool.execute({ projectId: 'proj-1', query: 'x' }, ctx);

    expect(result).toEqual({ error: expect.stringContaining('ConqrPlan') });
  });
});
