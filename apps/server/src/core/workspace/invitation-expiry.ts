/** How long an invitation link stays valid, counted from its last (re)issue. */
export const INVITATION_VALIDITY_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export const INVITATION_EXPIRED_MESSAGE =
  'Cette invitation a expiré. Demandez à un administrateur de vous la renvoyer.';

/** The expiry of an invitation issued (or re-issued) at `from`. */
export function invitationExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_VALIDITY_DAYS * DAY_MS);
}

/**
 * True once the expiry has passed. An invitation without an expiry (a row
 * written before the column existed and missed by the backfill) stays valid,
 * as it was before expiry existed.
 */
export function isInvitationExpired(
  expiresAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) return false;
  return at <= now.getTime();
}
