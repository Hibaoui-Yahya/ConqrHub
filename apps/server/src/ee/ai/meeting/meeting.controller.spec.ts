import { MeetingController } from './meeting.controller';

jest.mock('./meeting.service', () => ({ MeetingService: class {} }));

/**
 * Every meeting route hands the service the caller's id, role and
 * workspace (LTC-03), so no route can act on a meeting by its UUID alone.
 */
describe('MeetingController actor wiring', () => {
  const user = { id: 'u1', role: 'member' } as any;
  const workspace = { id: 'w1' } as any;
  const actor = { id: 'u1', role: 'member', workspaceId: 'w1' };

  function setup() {
    const service: Record<string, jest.Mock> = {};
    const proxy = new Proxy(service, {
      get: (target, key: string) => (target[key] ??= jest.fn(async () => ({ stream: null, mime: 'audio/webm' }))),
    });
    return { controller: new MeetingController(proxy as any), service };
  }

  it('passes the actor to reads, writes, retry and audio', async () => {
    const { controller, service } = setup();
    const reply: any = { header: () => reply, send: () => reply };
    await controller.get('m1', user, workspace);
    await controller.status('m1', user, workspace);
    await controller.transcript('m1', user, workspace, '2');
    await controller.update('m1', { title: 'x' } as any, user, workspace);
    await controller.delete('m1', user, workspace);
    await controller.retry('m1', user, workspace);
    await controller.process('m1', {} as any, user, workspace);
    await controller.saveMarkers('m1', { markers: [] } as any, user, workspace);
    await controller.saveAiOutput('m1', { key: 'summary', value: 'x' } as any, user, workspace);
    await controller.listDocuments('m1', user, workspace);
    await controller.listProposals('m1', user, workspace);
    await controller.approveProposal('m1', 'p1', {} as any, user, workspace);
    await controller.rejectProposal('m1', 'p1', user, workspace);
    await controller.approveSafeProposals('m1', user, workspace);
    await controller.reviewMeeting('m1', { action: 'complete' } as any, user, workspace);
    await controller.reviewSpeakers('m1', { baseVersion: 1 } as any, user, workspace);
    await controller.attributeSpeakers('m1', { baseVersion: 1 } as any, user, workspace);
    await controller.generateEvaluation('m1', {} as any, user, workspace);
    await controller.saveEvaluation('m1', {} as any, user, workspace);
    await controller.stop('m1', {} as any, user, workspace);
    await controller.capture('m1', user, workspace);
    await controller.listInsights('m1', {} as any, user, workspace);
    await controller.saveInsight('m1', { kind: 'qa', question: 'q', content: 'a' } as any, user, workspace);
    await controller.deleteInsight('m1', 'i1', user, workspace);
    await controller.getAudio('m1', user, workspace);
    await controller.streamAudio('m1', undefined, user, workspace, reply);
    for (const [name, fn] of Object.entries(service)) {
      expect([name, fn.mock.calls[0][0]]).toEqual([name, actor]);
    }
    expect(service.getTranscript.mock.calls[0]).toEqual([actor, 'm1', 2]);
    await controller.list({} as any, user, workspace);
    expect(service.list.mock.calls[0]).toEqual(['w1', expect.any(Object), actor]);
  });

  it("lists company-wide by default and only the caller's meetings for the Home (scope=mine)", async () => {
    const { controller, service } = setup();
    await controller.list({ limit: 30 } as any, user, workspace);
    await controller.list({ limit: 30, scope: 'all' } as any, user, workspace);
    await controller.list({ limit: 30, scope: 'mine' } as any, user, workspace);
    expect(service.list.mock.calls.map((c) => c[1].mine)).toEqual([false, false, true]);
  });
});
