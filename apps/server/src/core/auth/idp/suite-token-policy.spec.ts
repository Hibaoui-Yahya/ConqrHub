import {
  clientProfiles,
  epochMatches,
  familyIsLive,
  refreshReusePolicy,
  suiteRouteAllowed,
} from './suite-token-policy';

describe('suite token policy', () => {
  const profiles = clientProfiles({} as NodeJS.ProcessEnv);

  it('lets the ConqrMeet BFF reach exactly its routes', () => {
    const ok = (m: string, u: string, b: unknown = {}) =>
      suiteRouteAllowed(profiles, 'conqrmeet', m, u, b);
    expect(ok('POST', '/api/ai/meeting')).toBe(true);
    expect(ok('GET', '/api/ai/meeting/abc/audio/file?target=original')).toBe(
      true,
    );
    expect(ok('POST', '/api/ai/meeting-templates/x/publish')).toBe(true);
    expect(ok('POST', '/api/spaces')).toBe(true);
    expect(ok('POST', '/api/spaces/delete')).toBe(false);
    expect(ok('POST', '/api/spaces/members/add')).toBe(false);
    expect(ok('POST', '/api/search')).toBe(true);
    expect(ok('POST', '/api/notifications/mark-all-read')).toBe(true);
    expect(ok('GET', '/api/attachments/img/user/a.png')).toBe(true);
    expect(ok('POST', '/api/workspace/invites/create')).toBe(false);
    expect(ok('POST', '/api/auth/change-password')).toBe(false);
  });

  it('limits profile writes to preferences and the tour flag', () => {
    const write = (body: unknown) =>
      suiteRouteAllowed(
        profiles,
        'conqrmeet',
        'POST',
        '/api/users/update',
        body,
      );
    expect(write({ theme: 'dark' })).toBe(true);
    expect(write({ meetingDefaults: { autoProcess: true } })).toBe(true);
    expect(write({ firstRun: { meetTourSeen: true } })).toBe(true);
    expect(write({ email: 'x@evil.test' })).toBe(false);
    expect(write({ theme: 'dark', name: 'x' })).toBe(false);
  });

  it('gives unknown and sign-in-only clients no API route', () => {
    expect(
      suiteRouteAllowed(profiles, 'plane', 'POST', '/api/ai/meeting', {}),
    ).toBe(false);
    expect(
      suiteRouteAllowed(profiles, undefined, 'POST', '/api/search', {}),
    ).toBe(false);
  });

  it('treats a missing epoch as epoch 0 and anything else strictly', () => {
    expect(epochMatches(undefined, 0)).toBe(true);
    expect(epochMatches(0, 0)).toBe(true);
    expect(epochMatches(undefined, 1)).toBe(false);
    expect(epochMatches(1, 2)).toBe(false);
  });

  it('never authorizes a missing, revoked, orphaned or expired family', () => {
    const live = {
      state: 'active',
      expiresAt: new Date(Date.now() + 60_000),
      hubSessionId: 's',
      userId: 'u',
      workspaceId: 'w',
      clientId: 'conqrmeet',
      userDisabled: false,
    };
    const claims = { userId: 'u', workspaceId: 'w', clientId: 'conqrmeet' };
    expect(familyIsLive(live, claims)).toBe(true);
    expect(familyIsLive(undefined, claims)).toBe(false);
    expect(familyIsLive({ ...live, state: 'revoked' }, claims)).toBe(false);
    expect(familyIsLive({ ...live, hubSessionId: null }, claims)).toBe(false);
    expect(
      familyIsLive({ ...live, expiresAt: new Date(Date.now() - 1) }, claims),
    ).toBe(false);
    expect(familyIsLive({ ...live, userDisabled: true }, claims)).toBe(false);
    expect(familyIsLive(live, { ...claims, userId: 'other' })).toBe(false);
    expect(familyIsLive(live, { ...claims, clientId: 'plane' })).toBe(false);
  });

  it('bounds the reuse window and count', () => {
    expect(refreshReusePolicy({} as NodeJS.ProcessEnv)).toEqual({
      windowSeconds: 30,
      maxReuse: 3,
    });
    expect(
      refreshReusePolicy({
        SUITE_IDP_REFRESH_REUSE_WINDOW_SECONDS: '9999',
        SUITE_IDP_REFRESH_MAX_REUSE: '99',
      } as any),
    ).toEqual({ windowSeconds: 120, maxReuse: 10 });
    expect(
      refreshReusePolicy({ SUITE_IDP_REFRESH_REUSE_WINDOW_SECONDS: '0' } as any)
        .windowSeconds,
    ).toBe(0);
  });
});
