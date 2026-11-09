import { UserService } from './user.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { Workspace } from '@docmost/db/types/entity.types';

describe('UserService first-run state', () => {
  const workspace = { id: 'company-1' } as Workspace;
  let setPreferenceObject: jest.Mock;
  let service: UserService;

  beforeEach(() => {
    setPreferenceObject = jest.fn().mockResolvedValue({ id: 'user-1' });
    service = new UserService(
      {
        findById: jest.fn().mockResolvedValue({ id: 'user-1', settings: {} }),
        setPreferenceObject,
      } as unknown as UserRepo,
      { log: jest.fn() } as any,
    );
  });

  it('stamps each flag with the server time and trims the job title', async () => {
    await service.update(
      {
        firstRun: {
          onboarded: true,
          hubTourSeen: true,
          meetTourSeen: true,
          jobTitle: '  Conseillère   en talents ',
        },
      } as any,
      'user-1',
      workspace,
    );
    const [, key, value] = setPreferenceObject.mock.calls[0];
    expect(key).toBe('firstRun');
    expect(value.jobTitle).toBe('Conseillère en talents');
    for (const field of ['onboardedAt', 'hubTourSeenAt', 'meetTourSeenAt']) {
      expect(Number.isNaN(Date.parse(value[field]))).toBe(false);
    }
  });

  it('never clears a flag: false is ignored', async () => {
    await service.update(
      { firstRun: { onboarded: false, meetTourSeen: false } } as any,
      'user-1',
      workspace,
    );
    expect(setPreferenceObject).not.toHaveBeenCalled();
  });
});
