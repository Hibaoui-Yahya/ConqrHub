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

/**
 * `lang` plays the recipient's account language: NotificationService.queueEmail
 * resolves it from users.locale and builds the subject and template with it.
 */
function makeService(proposals: any[] = [], lang: 'fr' | 'en' = 'fr') {
  const emails: any[] = [];
  const resolve = (v: any) => (typeof v === 'function' ? v(lang) : v);
  const notificationService: any = {
    create: async (data: any) => ({ id: 'n1', ...data }),
    queueEmail: async (
      userId: string,
      notificationId: string,
      subject: any,
      template: any,
      type: string,
    ) =>
      emails.push({
        userId,
        notificationId,
        subject: resolve(subject),
        template: resolve(template),
        type,
      }),
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

  it('writes to an English account in English, dates included', async () => {
    const { service, emails } = makeService(
      [
        {
          title: 'Finaliser la grille',
          payload: { owner: 'Sarah Martin', dueDate: '2026-10-17' },
        },
      ],
      'en',
    );
    await service.onTransition(meeting.id, 'analyzing', 'awaiting_review');
    expect(emails[0].subject).toBe(
      '1 action to review after “Point hebdo recrutement”',
    );
    const text = await render(emails[0].template, { plainText: true });
    expect(text).toContain('Your minutes are ready');
    expect(text).toContain('Sarah Martin · due October 17, 2026');
    expect(text).toContain('October 14, 2026 at 10:00 AM');
    expect(text).not.toContain('Bonjour');
  });

  it('translates a known failure reason for an English account', async () => {
    const { service, emails } = makeService([], 'en');
    (service as any).db = makeDb({
      meetings: {
        one: {
          ...meeting,
          failureReason:
            'Le traitement a échoué après plusieurs tentatives. L’audio est conservé : relancez le traitement. Détail : timeout',
        },
      },
    });
    await service.onTransition(meeting.id, 'transcribing', 'failed');
    expect(emails[0].subject).toBe(
      'Processing of “Point hebdo recrutement” failed',
    );
    const text = await render(emails[0].template, { plainText: true });
    expect(text).toContain(
      'Processing failed after several attempts. The audio is kept: restart the processing. Detail: timeout',
    );
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
