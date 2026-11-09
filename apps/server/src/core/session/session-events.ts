/**
 * Emitted after Hub sessions were revoked, so long-lived connections (the
 * realtime WebSocket) drop at once instead of waiting for their next check.
 * The database stays the authority; this event only shortens the delay.
 */
export const SESSIONS_REVOKED_EVENT = 'auth.sessions.revoked';

export interface SessionsRevokedEvent {
  userId: string;
  workspaceId: string;
  /** Exactly these sessions. */
  sessionIds?: string[];
  /** Every session of the user except this one ("log out other devices"). */
  allExcept?: string;
  /** Every session of the user. */
  all?: boolean;
}
