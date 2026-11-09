import { AccountEmailService } from './account-email.service';
import { render } from '@react-email/render';

/** Query-builder double: every call chains; results are keyed by table. */
function makeDb(rows: Record<string, { many?: any[]; one?: any }>) {
  return {
    selectFrom: (table: string) => {
      const chain: any = {
        select: () => chain,
        where: () => chain,
        execute: async () => rows[table]?.many ?? [],
        executeTakeFirst: async () => rows[table]?.one,
      };
      return chain;
    },
  } as any;
}

function makeService(previousSessions: any[]) {
  const sent: any[] = [];
  const mailService: any = { sendToQueue: async (m: any) => sent.push(m) };
  const domainService: any = { getUrl: () => 'https://ltc.conqrhub.com' };
  const environmentService: any = { getMeetAppUrl: () => '' };
  const db = makeDb({
    userSessions: { many: previousSessions },
    workspaces: { one: { name: 'LTC', hostname: null } },
  });
  return {
    service: new AccountEmailService(
      mailService,
      domainService,
      environmentService,
      db,
    ),
    sent,
  };
}

const user = {
  id: 'u1',
  name: 'Sarah Martin',
  email: 'sarah@exemple.fr',
  workspaceId: 'w1',
  locale: 'fr-FR',
};
const englishUser = {
  ...user,
  name: 'Sam Miller',
  email: 'sam@example.com',
  locale: 'en-US',
};
const session = {
  id: 's2',
  deviceName: 'Firefox on Linux',
  ipAddress: '81.250.12.34',
};

describe('AccountEmailService.signInIfNewDevice', () => {
  it('stays silent on the very first session of an account', async () => {
    const { service, sent } = makeService([]);
    await service.signInIfNewDevice(user, session);
    expect(sent).toHaveLength(0);
  });

  it('stays silent on a device the account already used', async () => {
    const { service, sent } = makeService([{ deviceName: 'Firefox on Linux' }]);
    await service.signInIfNewDevice(user, session);
    expect(sent).toHaveLength(0);
  });

  it('warns the owner of the account about an unknown device', async () => {
    const { service, sent } = makeService([
      { deviceName: 'Chrome on Windows' },
    ]);
    await service.signInIfNewDevice(user, session);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('sarah@exemple.fr');
    expect(sent[0].subject).toBe('Nouvelle connexion à votre compte ConqrAI');
  });
});

describe('AccountEmailService.emailChanged', () => {
  it('writes to the old address, never the new one', async () => {
    const { service, sent } = makeService([]);
    await service.emailChanged(user, 'old@exemple.fr', 'new@exemple.fr');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('old@exemple.fr');
  });

  it('sends nothing when the address did not change', async () => {
    const { service, sent } = makeService([]);
    await service.emailChanged(user, 'same@exemple.fr', 'same@exemple.fr');
    expect(sent).toHaveLength(0);
  });
});

describe('AccountEmailService writes in the account language', () => {
  it('French account: French subject and body', async () => {
    const { service, sent } = makeService([]);
    await service.roleChanged(user, 'Alex Admin', 'member', 'admin');
    expect(sent[0].subject).toBe('Votre rôle dans LTC a changé');
    const text = await render(sent[0].template, { plainText: true });
    expect(text).toContain('Bonjour Sarah,');
    expect(text).toContain('Membre → Administrateur');
  });

  it('English account: English subject, body and dates', async () => {
    const { service, sent } = makeService([
      { deviceName: 'Chrome on Windows' },
    ]);
    await service.roleChanged(englishUser, 'Alex Admin', 'member', 'admin');
    await service.signInIfNewDevice(englishUser, session);
    await service.accessRemoved(englishUser, true);
    await service.emailChanged(
      englishUser,
      'old@example.com',
      'new@example.com',
    );
    expect(sent.map((m) => m.subject)).toEqual([
      'Your role in LTC has changed',
      'New sign-in to your ConqrAI account',
      'Your account in LTC has been deleted',
      'The e-mail address of your account has been changed',
    ]);
    const role = await render(sent[0].template, { plainText: true });
    expect(role).toContain('Hello Sam,');
    expect(role).toContain('Member → Admin');
    const signIn = await render(sent[1].template, { plainText: true });
    expect(signIn).toContain('Firefox on Linux');
    expect(signIn).toContain('(Paris time)');
    expect(signIn).toMatch(/ (AM|PM) /);
    for (const m of sent) {
      const text = await render(m.template, { plainText: true });
      expect(text).not.toMatch(/Bonjour|Vous /);
    }
  });

  it('looks the language up when the caller does not pass it', async () => {
    const sent: any[] = [];
    const service = new AccountEmailService(
      { sendToQueue: async (m: any) => sent.push(m) } as any,
      { getUrl: () => 'https://x' } as any,
      { getMeetAppUrl: () => '' } as any,
      makeDb({
        workspaces: { one: { name: 'LTC' } },
        users: { one: { locale: 'fr-CA' } },
      }),
    );
    const { locale: _locale, ...noLocale } = englishUser;
    await service.accessRemoved(noLocale);
    expect(sent[0].subject).toBe('Votre accès à LTC a été désactivé');
  });
});

describe('AccountEmailService never fails the caller', () => {
  it('swallows a mail queue outage', async () => {
    const mailService: any = {
      sendToQueue: async () => {
        throw new Error('redis down');
      },
    };
    const service = new AccountEmailService(
      mailService,
      { getUrl: () => 'https://x' } as any,
      { getMeetAppUrl: () => '' } as any,
      makeDb({ workspaces: { one: { name: 'LTC' } } }),
    );
    await expect(service.accessRemoved(user)).resolves.toBeUndefined();
  });
});
