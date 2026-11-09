/**
 * Meeting sharing, phase 1: which grants reach a viewer. A grant reaches
 * them when it names them, or names a live, non-default group of their
 * company they belong to. Group membership is read live: joining or leaving
 * a group changes access at once. A default group (the whole company) never
 * grants a meeting, even if a row names one.
 *
 * Used by MeetingAccessGuard and MeetingService (reading one meeting) and by
 * the "shared with me" list, so the three never disagree.
 */
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { isMeetingId, type MeetingActor } from './meeting-access.util';

/** Most grants added in one call. */
export const MAX_SHARE_TARGETS = 50;

/** meeting_shares rows that reach `viewer`, in the viewer's company. */
export function sharesReaching(db: KyselyDB, viewer: MeetingActor) {
  return db
    .selectFrom('meetingShares')
    .where('meetingShares.workspaceId', '=', viewer.workspaceId)
    .where((eb) =>
      eb.or([
        eb('meetingShares.userId', '=', viewer.id),
        eb(
          'meetingShares.groupId',
          'in',
          eb
            .selectFrom('groupUsers')
            .innerJoin('groups', 'groups.id', 'groupUsers.groupId')
            .select('groupUsers.groupId')
            .where('groupUsers.userId', '=', viewer.id)
            .where('groups.workspaceId', '=', viewer.workspaceId)
            .where('groups.deletedAt', 'is', null)
            .where('groups.isDefault', '=', false),
        ),
      ]),
    );
}

/** Whether a grant on this meeting reaches the viewer. */
export async function meetingSharedWith(
  db: KyselyDB,
  meetingId: string,
  viewer: MeetingActor | null | undefined,
): Promise<boolean> {
  if (!viewer?.id || !viewer.workspaceId || !isMeetingId(meetingId)) return false;
  const row = await sharesReaching(db, viewer)
    .select('meetingShares.id')
    .where('meetingShares.meetingId', '=', meetingId)
    .executeTakeFirst();
  return !!row;
}

/** Distinct, well-formed ids of a request, and the malformed ones. */
export function splitIds(values: unknown): { ids: string[]; malformed: string[] } {
  const list = Array.isArray(values) ? values : [];
  const ids = new Set<string>();
  const malformed: string[] = [];
  for (const v of list) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (isMeetingId(s)) ids.add(s.toLowerCase());
    else malformed.push(String(v));
  }
  return { ids: [...ids], malformed };
}
