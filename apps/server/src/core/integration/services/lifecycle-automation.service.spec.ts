import { LifecycleAutomationService } from './lifecycle-automation.service';
import { EventType } from '../domain/event-envelope';

function make(mapped: any[]) {
  const mappings = {
    findPrimaryByProjectAnyWorkspace: jest.fn().mockResolvedValue(mapped),
  };
  const events = { record: jest.fn().mockResolvedValue({}) };
  return {
    service: new LifecycleAutomationService(mappings as any, events as any),
    events,
  };
}

describe('LifecycleAutomationService', () => {
  it('suggests a retrospective for a completed cycle in each mapped space', async () => {
    const { service, events } = make([
      { workspaceId: 'ws1', spaceId: 's1' },
      { workspaceId: 'ws2', spaceId: 's2' },
    ]);
    const res = await service.onContainerCompleted({
      kind: 'cycle',
      projectId: 'p1',
      id: 'cy1',
      name: 'Sprint 3',
    });
    expect(res.suggestionsEmitted).toBe(2);
    const first = events.record.mock.calls[0][0];
    expect(first.type).toBe(EventType.RetroSuggested);
    expect(first.data.templateKind).toBe('retrospective');
    expect(first.data.requiresHumanApproval).toBe(true);
    expect(first.data.spaceId).toBe('s1');
  });

  it('uses the review template for a completed module', async () => {
    const { service, events } = make([{ workspaceId: 'ws1', spaceId: 's1' }]);
    await service.onContainerCompleted({
      kind: 'module',
      projectId: 'p1',
      id: 'm1',
    });
    expect(events.record.mock.calls[0][0].data.templateKind).toBe('review');
  });

  it('emits nothing when the project is not mapped', async () => {
    const { service, events } = make([]);
    const res = await service.onContainerCompleted({
      kind: 'cycle',
      projectId: 'p1',
      id: 'cy1',
    });
    expect(res.suggestionsEmitted).toBe(0);
    expect(events.record).not.toHaveBeenCalled();
  });
});
