import { PlaneApiError } from '../../../../core/integration/services/plane-client.service';
import { ChatToolRegistry } from './chat-tool.registry';
import {
  UpdateWorkItemTool,
  ListWorkItemStatesTool,
  GetWorkItemCommentsTool,
  AddWorkItemCommentTool,
  ListCycleWorkItemsTool,
  ListWorkItemLabelsTool,
  ListConqrPlanMembersTool,
  PLANE_WORK_MANAGEMENT_TOOLS,
} from './plane-work-management.tools';

const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

function makePlaneMock(enabled: boolean) {
  return {
    isEnabled: jest.fn().mockReturnValue(enabled),
    updateWorkItem: jest.fn(),
    listStates: jest.fn(),
    listWorkItemComments: jest.fn(),
    addWorkItemComment: jest.fn(),
    listCycleWorkItems: jest.fn(),
    listLabels: jest.fn(),
    listWorkspaceMembers: jest.fn(),
  };
}

function constructAll(plane: any, registry: ChatToolRegistry) {
  return [
    new UpdateWorkItemTool(plane, registry),
    new ListWorkItemStatesTool(plane, registry),
    new GetWorkItemCommentsTool(plane, registry),
    new AddWorkItemCommentTool(plane, registry),
    new ListCycleWorkItemsTool(plane, registry),
    new ListWorkItemLabelsTool(plane, registry),
    new ListConqrPlanMembersTool(plane, registry),
  ];
}

describe('Plane work-management tools', () => {
  it('does not register any tool when the integration is disabled', () => {
    const plane = makePlaneMock(false);
    const registry = new ChatToolRegistry();
    constructAll(plane, registry).forEach((t) => t.onModuleInit());
    expect(registry.getAll()).toHaveLength(0);
  });

  it('registers all seven tools when the integration is enabled', () => {
    const plane = makePlaneMock(true);
    const registry = new ChatToolRegistry();
    constructAll(plane, registry).forEach((t) => t.onModuleInit());
    expect(registry.getAll().map((t) => t.name)).toEqual([
      'update_work_item',
      'list_work_item_states',
      'get_work_item_comments',
      'add_work_item_comment',
      'list_cycle_work_items',
      'list_work_item_labels',
      'list_conqrplan_members',
    ]);
    expect(PLANE_WORK_MANAGEMENT_TOOLS).toHaveLength(7);
  });

  it('update_work_item sends only the provided fields as a PATCH', async () => {
    const plane = makePlaneMock(true);
    plane.updateWorkItem.mockResolvedValue({
      id: 'wi-1',
      name: 'Renamed',
      sequence_id: 3,
      state_detail: { name: 'In Progress' },
      priority: 'high',
      updated_at: '2026-09-01T00:00:00Z',
    });
    const tool = new UpdateWorkItemTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute(
      { projectId: 'proj-1', workItemId: 'wi-1', name: 'Renamed', stateId: 'state-9' },
      ctx,
    );

    expect(plane.updateWorkItem).toHaveBeenCalledWith(
      'proj-1',
      'wi-1',
      {
        name: 'Renamed',
        description_html: undefined,
        priority: undefined,
        state: 'state-9',
      },
      { onBehalfOf: 'user-1' },
    );
    expect(result).toMatchObject({ id: 'wi-1', name: 'Renamed', state: 'In Progress' });
  });

  it('update_work_item refuses an empty patch', async () => {
    const plane = makePlaneMock(true);
    const tool = new UpdateWorkItemTool(plane as any, new ChatToolRegistry());
    const result = await tool.execute({ projectId: 'p', workItemId: 'w' }, ctx);
    expect(result).toEqual({ error: expect.stringContaining('Nothing to update') });
    expect(plane.updateWorkItem).not.toHaveBeenCalled();
  });

  it('get_work_item_comments strips HTML when no stripped text is provided', async () => {
    const plane = makePlaneMock(true);
    plane.listWorkItemComments.mockResolvedValue([
      {
        id: 'c-1',
        comment_html: '<p>Looks <strong>good</strong></p>',
        actor: 'member-1',
        created_at: '2026-08-30T00:00:00Z',
      },
    ]);
    const tool = new GetWorkItemCommentsTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute({ projectId: 'p', workItemId: 'w' }, ctx);

    expect(result).toEqual([
      {
        id: 'c-1',
        text: 'Looks good',
        actorId: 'member-1',
        createdAt: '2026-08-30T00:00:00Z',
      },
    ]);
  });

  it('add_work_item_comment wraps plain text in a paragraph and attributes the actor', async () => {
    const plane = makePlaneMock(true);
    plane.addWorkItemComment.mockResolvedValue({ id: 'c-2', created_at: '2026-09-01T00:00:00Z' });
    const tool = new AddWorkItemCommentTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute(
      { projectId: 'p', workItemId: 'w', text: 'Shipping today' },
      ctx,
    );

    expect(plane.addWorkItemComment).toHaveBeenCalledWith(
      'p',
      'w',
      '<p>Shipping today</p>',
      { onBehalfOf: 'user-1' },
    );
    expect(result).toEqual({ id: 'c-2', createdAt: '2026-09-01T00:00:00Z', success: true });
  });

  it('list_cycle_work_items returns trimmed summaries', async () => {
    const plane = makePlaneMock(true);
    plane.listCycleWorkItems.mockResolvedValue([
      {
        id: 'wi-9',
        name: 'Sprint task',
        sequence_id: 9,
        state_detail: { name: 'Done' },
        priority: 'low',
        updated_at: '2026-08-20T00:00:00Z',
      },
    ]);
    const tool = new ListCycleWorkItemsTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute({ projectId: 'p', cycleId: 'cy-1' }, ctx);

    expect(plane.listCycleWorkItems).toHaveBeenCalledWith('p', 'cy-1');
    expect(result).toEqual([
      {
        id: 'wi-9',
        name: 'Sprint task',
        sequenceId: 9,
        state: 'Done',
        priority: 'low',
        updatedAt: '2026-08-20T00:00:00Z',
      },
    ]);
  });

  it('list_work_item_states returns id/name/group', async () => {
    const plane = makePlaneMock(true);
    plane.listStates.mockResolvedValue([
      { id: 's-1', name: 'Backlog', group: 'backlog', default: true },
      { id: 's-2', name: 'Done', group: 'completed' },
    ]);
    const tool = new ListWorkItemStatesTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute({ projectId: 'p' }, ctx);

    expect(result).toEqual([
      { id: 's-1', name: 'Backlog', group: 'backlog', default: true },
      { id: 's-2', name: 'Done', group: 'completed', default: false },
    ]);
  });

  it('list_conqrplan_members composes a display name', async () => {
    const plane = makePlaneMock(true);
    plane.listWorkspaceMembers.mockResolvedValue([
      { id: 'm-1', display_name: 'Yahya', email: 'y@x.com' },
      { id: 'm-2', first_name: 'Ada', last_name: 'Lovelace' },
    ]);
    const tool = new ListConqrPlanMembersTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute({}, ctx);

    expect(result).toEqual([
      { id: 'm-1', displayName: 'Yahya', email: 'y@x.com' },
      { id: 'm-2', displayName: 'Ada Lovelace', email: null },
    ]);
  });

  it('tools surface PlaneApiError as a structured error object', async () => {
    const plane = makePlaneMock(true);
    plane.listStates.mockRejectedValue(new PlaneApiError('Plane API 503', 503, true));
    const tool = new ListWorkItemStatesTool(plane as any, new ChatToolRegistry());

    const result = await tool.execute({ projectId: 'p' }, ctx);

    expect(result).toEqual({ error: expect.stringContaining('ConqrPlan') });
  });
});
