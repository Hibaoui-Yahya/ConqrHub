import { AccountEmailService } from './account-email.service';

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
