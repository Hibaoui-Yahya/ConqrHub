/**
 * Who may do what with a meeting. The company rule (LTC, 13 Oct 2026):
 * "All company members can read; only the creator and Owners/Admins can
 * edit." Reads stay workspace-scoped for every active member (disabled
 * accounts never get past JwtAuthGuard); every write needs the creator or
 * an Owner/Admin of the same workspace. Publishing in Hub additionally
 * needs the space's own page-creation permission.
 * Pure; unit-tested in meeting-access.util.spec.ts.
 */
import { UserRole } from '../../../common/helpers/types/permission';

export interface MeetingActor {
  id: string;
  workspaceId: string;
  role?: string | null;
}

export interface MeetingOwnership {
  userId: string;
  workspaceId: string;
}

/** What MeetingAccessGuard reads of a meeting. */
export interface MeetingAccessSubject extends MeetingOwnership {
  spaceId?: string | null;
  settings?: unknown;
}

/** The caller, as MeetingAccessGuard sees it. */
export type MeetingAccessViewer = MeetingActor;

/** Shown instead of a surprise 403 to coworkers who can only read. */
export const MEETING_READ_ONLY_MESSAGE =
  'Lecture seule : seules la personne qui a créé cette réunion, les propriétaires et les administrateurs peuvent la modifier.';

export const TEMPLATE_DEFAULT_ADMIN_MESSAGE =
  'Seuls les propriétaires et les administrateurs peuvent changer le modèle par défaut de l’entreprise.';

export const TEMPLATE_READ_ONLY_MESSAGE =
  'Lecture seule : seules la personne qui a créé ce modèle, les propriétaires et les administrateurs peuvent le modifier.';

/** Owner or Admin of the workspace. Takes an actor or a bare role. */
export function isWorkspaceManager(
  actor: Pick<MeetingActor, 'role'> | string | null | undefined,
): boolean {
  const role = typeof actor === 'string' || actor == null ? actor : actor.role;
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}

/** Every member of the meeting's company reads it; nobody else does. */
export function canReadMeeting(
  meeting: MeetingOwnership,
  viewer: MeetingAccessViewer,
): boolean {
  if (!viewer?.id || !viewer.workspaceId) return false;
  return meeting.workspaceId === viewer.workspaceId;
}

export function canEditMeeting(
  meeting: MeetingOwnership,
  actor: MeetingActor,
): boolean {
  if (!canReadMeeting(meeting, actor)) return false;
  return meeting.userId === actor.id || isWorkspaceManager(actor);
}

/**
 * The Hub spaces a meeting belongs to: its own space and the space it was
 * published into. Not an access rule — reads are company-wide — but used
 * where a meeting is shown next to its spaces.
 */
export function meetingSpaceIds(
  meeting: Pick<MeetingAccessSubject, 'spaceId' | 'settings'>,
): string[] {
  const settings = (
    typeof meeting.settings === 'string'
      ? safeParse(meeting.settings)
      : meeting.settings
  ) as { publishedBundle?: { spaceId?: unknown } } | null | undefined;
  const ids = [meeting.spaceId, settings?.publishedBundle?.spaceId].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  return [...new Set(ids)];
}

/** A meeting id that Postgres can compare to a uuid column. Anything else
 *  is "not found" — never a 500 from an invalid uuid cast. */
export function isMeetingId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

/** Review, evaluate, publish, rename, delete: the creator or an
 *  Owner/Admin (same rule as canEditMeeting). */
export const canWriteMeeting = canEditMeeting;

/** Methods that change a meeting. */
export function isWriteMethod(method: string | undefined): boolean {
  return !!method && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
