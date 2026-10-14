import { MeetingNotificationService } from './meeting.notification';
import { NotificationType } from '../notification.constants';

function makeService(meeting: Record<string, unknown> | undefined, failCreate = false) {
  const created: any[] = [];
  const db: any = {
    selectFrom: () => ({
      select: () => ({
        where: () => ({ executeTakeFirst: async () => meeting }),
      }),
    }),
  };
  const notificationService: any = {
    create: async (data: any) => {
      if (failCreate) throw new Error('db down');
      created.push(data);
      return data;
    },
  };
  return { service: new MeetingNotificationService(db, notificationService), created };
}

const meeting = {
  id: 'm1',
  title: 'Entrevue — Julie Martin',
  userId: 'u1',
  workspaceId: 'w1',
  failureReason: 'audio unreadable',
};

describe('MeetingNotificationService', () => {
  it('tells the owner when the meeting is ready for review', async () => {
    const { service, created } = makeService(meeting);
    await service.onTransition('m1', 'analyzing', 'awaiting_review');
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe(NotificationType.MEETING_READY);
    expect(created[0].userId).toBe('u1');
    expect(created[0].data).toMatchObject({
      meetingId: 'm1',
      meetingTitle: 'Entrevue — Julie Martin',
    });
  });

  it('stores data as an object, not a JSON string', async () => {
    const { service, created } = makeService(meeting);
    await service.onTransition('m1', 'analyzing', 'awaiting_review');
    expect(typeof created[0].data).toBe('object');
  });

  it('reports failures with the reason', async () => {
    const { service, created } = makeService(meeting);
    await service.onTransition('m1', 'transcribed', 'failed', { error: 'STT timeout' });
    expect(created[0].type).toBe(NotificationType.MEETING_FAILED);
    expect(created[0].data.reason).toBe('STT timeout');
  });

  it('falls back to the stored failure reason', async () => {
    const { service, created } = makeService(meeting);
    await service.onTransition('m1', 'transcribed', 'failed');
    expect(created[0].data.reason).toBe('audio unreadable');
  });

  it('asks for speaker review', async () => {
    const { service, created } = makeService(meeting);
    await service.onTransition('m1', 'transcribed', 'speakers_pending_review');
    expect(created[0].type).toBe(NotificationType.MEETING_REVIEW_NEEDED);
  });

  it('stays silent on intermediate steps and on the reviewer closing the review', async () => {
    const { service, created } = makeService(meeting);
    for (const [from, to] of [
      ['uploaded', 'normalizing_audio'],
      ['transcribed', 'analyzing'],
      ['analyzing', 'documents_generating'],
      ['awaiting_review', 'completed'],
      ['awaiting_review', 'awaiting_review'],
    ]) {
      await service.onTransition('m1', from, to);
    }
    expect(created).toHaveLength(0);
  });

  it('announces a publication with the page it created', async () => {
    const { service, created } = makeService(meeting);
    await service.onPublished('m1', 'p1', 's1');
    expect(created[0]).toMatchObject({
      type: NotificationType.MEETING_PUBLISHED,
      pageId: 'p1',
      spaceId: 's1',
    });
  });

  it('never throws into the pipeline', async () => {
    const { service } = makeService(meeting, true);
    await expect(service.onTransition('m1', 'analyzing', 'awaiting_review')).resolves.toBeUndefined();
    const missing = makeService(undefined);
    await missing.service.onTransition('m1', 'analyzing', 'awaiting_review');
    expect(missing.created).toHaveLength(0);
  });
});
