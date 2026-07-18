import { NotificationDedupService } from './notification-dedup.service';
import { EventType } from '../domain/event-envelope';

function ev(over: Partial<any>): any {
  return {
    correlationId: 'c1',
    type: EventType.RelationshipCreated,
    subject: 'conqr://hub/page/p1',
    actorId: 'u1',
    createdAt: '2026-07-18T10:00:00Z',
    ...over,
  };
}

describe('NotificationDedupService.dedupe', () => {
  const service = new NotificationDedupService({} as any);

  it('collapses a correlation chain into one notification', () => {
    const out = service.dedupe([
      ev({ type: EventType.RelationshipCreated }),
      ev({ type: EventType.PlaneWorkItemUpdated }), // mechanical follow-up
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].collapsedEventCount).toBe(2);
    // The meaningful outcome (link created) wins over the follow-up.
    expect(out[0].outcome).toBe('linked');
  });

  it('keeps separate correlation chains separate', () => {
    const out = service.dedupe([
      ev({ correlationId: 'a', type: EventType.RelationshipCreated }),
      ev({ correlationId: 'b', type: EventType.MappingChanged }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('sorts newest first', () => {
    const out = service.dedupe([
      ev({ correlationId: 'old', createdAt: '2026-07-18T09:00:00Z' }),
      ev({ correlationId: 'new', createdAt: '2026-07-18T12:00:00Z' }),
    ]);
    expect(out[0].correlationId).toBe('new');
  });

  it('returns empty for no events', () => {
    expect(service.dedupe([])).toEqual([]);
  });
});

describe('NotificationDedupService.recentForWorkspace (§5.3C Suite feed)', () => {
  it('fetches recent workspace events, dedupes, and caps AFTER dedup', async () => {
    const events = [
      ev({ correlationId: 'c1', createdAt: '2026-07-18T12:00:00Z' }),
      ev({ correlationId: 'c1', type: 'plane.work-item.updated', createdAt: '2026-07-18T12:00:01Z' }),
      ev({ correlationId: 'c2', createdAt: '2026-07-18T11:00:00Z' }),
      ev({ correlationId: 'c3', createdAt: '2026-07-18T10:00:00Z' }),
    ];
    const repo = { findRecentByWorkspace: jest.fn().mockResolvedValue(events) };
    const service = new NotificationDedupService(repo as any);
    const out = await service.recentForWorkspace('ws1', 2);
    expect(repo.findRecentByWorkspace).toHaveBeenCalledWith('ws1', 200);
    expect(out).toHaveLength(2); // capped after dedup (3 chains -> 2)
    expect(out[0].correlationId).toBe('c1'); // newest first
    expect(out[0].collapsedEventCount).toBe(2);
  });

  it('returns empty for a quiet workspace', async () => {
    const repo = { findRecentByWorkspace: jest.fn().mockResolvedValue([]) };
    const service = new NotificationDedupService(repo as any);
    expect(await service.recentForWorkspace('ws1')).toEqual([]);
  });
});
