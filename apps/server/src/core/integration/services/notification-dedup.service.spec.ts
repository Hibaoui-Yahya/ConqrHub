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
