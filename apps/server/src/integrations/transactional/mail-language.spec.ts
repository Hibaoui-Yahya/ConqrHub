import { render } from '@react-email/render';
import { mailLanguage } from './i18n';
import { AuthService } from '../../core/auth/services/auth.service';
import { WorkspaceInvitationService } from '../../core/workspace/services/workspace-invitation.service';
import { NotificationService } from '../../core/notification/notification.service';
import { CommentNotificationService } from '../../core/notification/services/comment.notification';
import { NotificationType } from '../../core/notification/notification.constants';

/**
 * Every e-mail family follows the RECIPIENT's account language: French for
 * a fr-* locale (unchanged wording), English otherwise. Without an account
 * yet (invitation), the inviter's language, then DEFAULT_USER_LOCALE.
 */

const text = (template: any) => render(template, { plainText: true });

describe('mailLanguage', () => {
  const previous = process.env.DEFAULT_USER_LOCALE;
  afterEach(() => {
    if (previous === undefined) delete process.env.DEFAULT_USER_LOCALE;
    else process.env.DEFAULT_USER_LOCALE = previous;
  });

  it('is French for any fr-* locale and English for any other', () => {
    expect(mailLanguage('fr-FR')).toBe('fr');
    expect(mailLanguage('fr-CA')).toBe('fr');
    expect(mailLanguage('en-US')).toBe('en');
    expect(mailLanguage('de-DE')).toBe('en');
  });

  it('takes the first usable candidate, then DEFAULT_USER_LOCALE, then English', () => {
    process.env.DEFAULT_USER_LOCALE = 'fr-FR';
    expect(mailLanguage(null, 'en-US')).toBe('en');
    expect(mailLanguage(undefined, '')).toBe('fr');
    delete process.env.DEFAULT_USER_LOCALE;
    expect(mailLanguage(undefined)).toBe('en');
  });
});

describe('password e-mails (AuthService)', () => {
  function makeAuth(locale: string | null) {
    const sent: any[] = [];
    const trx: any = {
      deleteFrom: () => trx,
      where: () => trx,
      execute: async () => undefined,
    };
    const service = new AuthService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        findByEmail: async () => ({
          id: 'u1',
          name: 'Sam Miller',
          email: 'sam@example.com',
          workspaceId: 'w1',
          locale,
        }),
      } as any,
      { insertUserToken: async () => undefined } as any,
      { sendToQueue: async (m: any) => sent.push(m) } as any,
      { getUrl: () => 'https://hub.example.com' } as any,
      {} as any,
      { transaction: () => ({ execute: (cb: any) => cb(trx) }) } as any,
      {} as any,
    );
    return { service, sent };
  }

  it('fr-FR recipient: French', async () => {
    const { service, sent } = makeAuth('fr-FR');
    await service.forgotPassword({ email: 'sam@example.com' } as any, {
      id: 'w1',
      hostname: null,
    } as any);
    expect(sent[0].subject).toBe('Réinitialisez votre mot de passe');
    const body = await text(sent[0].template);
    expect(body).toContain('Bonjour Sam,');
    expect(body).toContain('Choisir un nouveau mot de passe');
  });

  it('en-US recipient: English', async () => {
    const { service, sent } = makeAuth('en-US');
    await service.forgotPassword({ email: 'sam@example.com' } as any, {
      id: 'w1',
      hostname: null,
    } as any);
    expect(sent[0].subject).toBe('Reset your password');
    const body = await text(sent[0].template);
    expect(body).toContain('Hello Sam,');
    expect(body).toContain('Choose a new password');
    expect(body).toContain('Button not working?');
  });
});

describe('invitation e-mail (WorkspaceInvitationService)', () => {
  function makeInvitations() {
    const sent: any[] = [];
    const service = new WorkspaceInvitationService(
      {} as any,
      {} as any,
      { sendToQueue: async (m: any) => sent.push(m) } as any,
      { getUrl: () => 'https://hub.example.com' } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getMeetAppUrl: () => '' } as any,
      {} as any,
    );
    return { service, sent };
  }

  const previous = process.env.DEFAULT_USER_LOCALE;
  afterEach(() => {
    if (previous === undefined) delete process.env.DEFAULT_USER_LOCALE;
    else process.env.DEFAULT_USER_LOCALE = previous;
  });

  it('follows a French inviter', async () => {
    const { service, sent } = makeInvitations();
    await service.sendInvitationMail('i1', 'new@example.com', 't', 'Alex', null, {
      role: 'member',
      workspaceName: 'LTC',
      inviterLocale: 'fr-FR',
    });
    expect(sent[0].subject).toBe('Alex vous invite à rejoindre LTC sur ConqrAI');
    const body = await text(sent[0].template);
    expect(body).toContain('Votre rôle : Membre.');
    expect(body).toContain('Ce lien est valable 7 jours');
  });

  it('follows an English inviter', async () => {
    const { service, sent } = makeInvitations();
    await service.sendInvitationMail('i1', 'new@example.com', 't', 'Alex', null, {
      role: 'admin',
      workspaceName: 'Acme',
      inviterLocale: 'en-US',
    });
    expect(sent[0].subject).toBe('Alex invited you to join Acme on ConqrAI');
    const body = await text(sent[0].template);
    expect(body).toContain('Your role: Admin.');
    expect(body).toContain('This link is valid for 7 days');
    expect(body).not.toContain('Bonjour');
  });

  it('without an inviter language: DEFAULT_USER_LOCALE, else English', async () => {
    process.env.DEFAULT_USER_LOCALE = 'fr-FR';
    const fr = makeInvitations();
    await fr.service.sendInvitationMail('i1', 'a@example.com', 't', undefined, null, {});
    expect(fr.sent[0].subject).toBe(
      'Invitation à rejoindre votre équipe sur ConqrAI',
    );
    delete process.env.DEFAULT_USER_LOCALE;
    const en = makeInvitations();
    await en.service.sendInvitationMail('i1', 'a@example.com', 't', undefined, null, {});
    expect(en.sent[0].subject).toBe('Invitation to join your team on ConqrAI');
  });
});

describe('notification e-mails (NotificationService.queueEmail)', () => {
  function makeNotifications(locale: string | null) {
    const sent: any[] = [];
    const qb: any = {};
    for (const m of ['select', 'where']) qb[m] = () => qb;
    qb.executeTakeFirst = async () => ({
      email: 'person@example.test',
      settings: {},
      locale,
    });
    const notificationService = new NotificationService(
      { insert: async (d: any) => ({ id: 'n1', ...d }) } as any,
      {} as any,
      { server: { to: () => ({ emit: () => undefined }) } } as any,
      {
        sendToQueue: async (m: any) =>
          sent.push({
            ...m,
            text: m.template?.type ? await text(m.template) : undefined,
          }),
      } as any,
      { selectFrom: () => qb } as any,
    );
    return { notificationService, sent };
  }

  async function resolvedComment(locale: string | null) {
    const { notificationService, sent } = makeNotifications(locale);
    const db: any = {
      selectFrom: (table: string) => {
        const chain: any = {
          select: () => chain,
          where: () => chain,
          executeTakeFirst: async () =>
            ({
              users: { id: 'a1', name: 'Alex Admin' },
              pages: { id: 'p1', title: 'Onboarding', slugId: 'abc' },
              spaces: { id: 's1', slug: 'hr' },
              comments: { content: 'Merci' },
            })[table],
        };
        return chain;
      },
    };
    const service = new CommentNotificationService(
      db,
      notificationService,
      { getUserSpaceRoles: async () => ['reader'] } as any,
      { getUserIdsWithPageAccess: async () => ['u1'] } as any,
      {} as any,
    );
    await service.processResolved(
      {
        commentId: 'c1',
        commentCreatorId: 'u1',
        pageId: 'p1',
        spaceId: 's1',
        workspaceId: 'w1',
        actorId: 'a1',
      } as any,
      'https://hub.example.com',
    );
    return sent;
  }

  it('fr-FR recipient: French', async () => {
    const sent = await resolvedComment('fr-FR');
    expect(sent[0].subject).toBe(
      'Votre commentaire sur « Onboarding » a été résolu',
    );
    expect(sent[0].text).toContain('Commentaire résolu');
    expect(sent[0].text).toContain(
      'Vous recevez cet e-mail selon vos préférences de notification ConqrHub.',
    );
  });

  it('en-US recipient: English', async () => {
    const sent = await resolvedComment('en-US');
    expect(sent[0].subject).toBe('Your comment on “Onboarding” was resolved');
    expect(sent[0].text).toContain('Comment resolved');
    expect(sent[0].text).toContain(
      'You are receiving this e-mail because of your ConqrHub notification preferences.',
    );
    expect(sent[0].text).not.toContain('Vous recevez');
  });

  it('still accepts a ready-made subject and template', async () => {
    const { notificationService, sent } = makeNotifications('en-US');
    await notificationService.queueEmail(
      'u1',
      'n1',
      'plain subject',
      {},
      NotificationType.COMMENT_CREATED,
    );
    expect(sent[0].subject).toBe('plain subject');
  });
});
