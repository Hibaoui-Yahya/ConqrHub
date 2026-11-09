import {
  INVITATION_VALIDITY_DAYS,
  invitationExpiresAt,
  isInvitationExpired,
} from './invitation-expiry';

describe('invitation expiry', () => {
  const issued = new Date('2026-10-16T10:00:00.000Z');

  it('lasts exactly one week from the (re)issue', () => {
    expect(INVITATION_VALIDITY_DAYS).toBe(7);
    expect(invitationExpiresAt(issued).toISOString()).toBe(
      '2026-10-23T10:00:00.000Z',
    );
  });

  it('is valid until the expiry and expired from it on', () => {
    const expiresAt = invitationExpiresAt(issued);
    expect(
      isInvitationExpired(expiresAt, new Date('2026-10-23T09:59:59.999Z')),
    ).toBe(false);
    expect(isInvitationExpired(expiresAt, new Date('2026-10-23T10:00:00.000Z'))).toBe(true);
    expect(isInvitationExpired(expiresAt.toISOString(), new Date('2026-11-01T00:00:00Z'))).toBe(true);
  });

  it('keeps an invitation without an expiry valid', () => {
    expect(isInvitationExpired(null)).toBe(false);
    expect(isInvitationExpired(undefined)).toBe(false);
    expect(isInvitationExpired('not a date')).toBe(false);
  });
});
