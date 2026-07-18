import { IntegrationEventBus } from './integration-event-bus';

describe('IntegrationEventBus', () => {
  it('delivers events only to the matching workspace subscriber', (done) => {
    const bus = new IntegrationEventBus();
    const received: string[] = [];

    const sub = bus.streamForWorkspace('ws1').subscribe((e) => {
      received.push(e.subject);
    });

    bus.publish({ workspaceId: 'ws2', type: 't', subject: 'other' });
    bus.publish({ workspaceId: 'ws1', type: 't', subject: 'mine' });

    setTimeout(() => {
      expect(received).toEqual(['mine']);
      sub.unsubscribe();
      done();
    }, 10);
  });

  it('supports multiple concurrent subscribers', (done) => {
    const bus = new IntegrationEventBus();
    let a = 0;
    let b = 0;
    const s1 = bus.streamForWorkspace('ws1').subscribe(() => (a += 1));
    const s2 = bus.streamForWorkspace('ws1').subscribe(() => (b += 1));
    bus.publish({ workspaceId: 'ws1', type: 't', subject: 'x' });
    setTimeout(() => {
      expect(a).toBe(1);
      expect(b).toBe(1);
      s1.unsubscribe();
      s2.unsubscribe();
      done();
    }, 10);
  });
});
