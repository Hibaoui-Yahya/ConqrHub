import { MeetingNotificationService } from './meeting.notification';
import { NotificationType } from '../notification.constants';
import { render } from '@react-email/render';

/** Query-builder double: every call chains; results are keyed by table. */
function makeDb(tables: Record<string, { one?: any; many?: any[] }>) {
  return {
    selectFrom: (table: string) => {
      const chain: any = {
        select: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        execute: async () => tables[table]?.many ?? [],
        executeTakeFirst: async () => tables[table]?.one,
      };
      return chain;
    },
  } as any;
}

const meeting = {
  id: '2f8a41c0-0000-4000-8000-000000000000',
  title: 'Point hebdo recrutement',
  userId: 'u1',
  workspaceId: 'w1',
  failureReason: 'Son inaudible',
  startedAt: '2026-10-14T08:00:00Z',
  durationMs: 45 * 60000,
  userName: 'Sarah Martin',
};

function makeService(proposals: any[] = []) {
  const emails: any[] = [];
  const notificationService: any = {
    create: async (data: any) => ({ id: 'n1', ...data }),
    queueEmail: async (
      userId: string,
      notificationId: string,
      subject: string,
      template: any,
      type: string,
    ) => emails.push({ userId, notificationId, subject, template, type }),
  };
  const env: any = {
    getMeetAppUrl: () => 'https://ltc.conqrmeet.com',
    getAppUrl: () => 'https://ltc.conqrhub.com',
  };
  const db = makeDb({
    meetings: { one: meeting },
    meetingActionProposals: { many: proposals },
  });
  return {
    service: new MeetingNotificationService(db, notificationService, env),
    emails,
  };
}

describe('MeetingNotificationService e-mails', () => {
  it('e-mails the owner the proposals waiting for a decision', async () => {
    const { service, emails } = makeService([
      {
        title: 'Finaliser la grille',
        payload: JSON.stringify({
          owner: 'Sarah Martin',
          dueDate: '2026-10-17',
        }),
      },
      { title: 'Publier les offres', payload: { owner: null, dueDate: null } },
    ]);
    await service.onTransition(meeting.id, 'analyzing', 'awaiting_review');
    expect(emails).toHaveLength(1);
    expect(emails[0].userId).toBe('u1');
    expect(emails[0].subject).toBe(
      '2 actions à valider après « Point hebdo recrutement »',
    );
    expect(emails[0].type).toBe(NotificationType.MEETING_READY);
    const text = await render(emails[0].template, { plainText: true });
    expect(text).toContain(`https://ltc.conqrmeet.com/meetings/${meeting.id}`);
    expect(text).toContain('45 min');
    expect(text).toContain('Finaliser la grille');
    expect(text).toContain('Sarah Martin · échéance 17 octobre 2026');
    expect(text).toContain('sans échéance');
  });

  it('announces a plain report when nothing needs deciding', async () => {
    const { service, emails } = makeService([]);
    await service.onTransition(meeting.id, 'analyzing', 'awaiting_review');
    expect(emails[0].subject).toBe(
      'Compte rendu prêt : Point hebdo recrutement',
    );
  });

  it('e-mails a failure with a support reference', async () => {
    const { service, emails } = makeService();
    await service.onTransition(meeting.id, 'transcribing', 'failed');
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe(
      'Le traitement de « Point hebdo recrutement » a échoué',
    );
    const text = await render(emails[0].template, { plainText: true });
    expect(text).toContain('MTG-2F8A41C0');
    expect(text).toContain('Son inaudible');
  });

  it('sends nothing for the speaker review step', async () => {
    const { service, emails } = makeService();
    await service.onTransition(
      meeting.id,
      'diarizing',
      'speakers_pending_review',
    );
    expect(emails).toHaveLength(0);
  });
});
