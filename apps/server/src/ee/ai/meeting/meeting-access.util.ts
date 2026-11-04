/**
 * Who may do what with a meeting. LTC "Strict Private", phase 0 (owner's
 * approval of 28 Oct 2026): a meeting is private to the person who created
 * it. Only that person changes, deletes or shares it; a workspace Owner or
 * Admin gets nothing from their role. Sharing, phase 1 (2 Nov 2026): the
 * creator may let named colleagues or groups READ it (meeting_shares).
 * Disabled accounts never get past JwtAuthGuard.
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

/** Refusal of a change to someone the meeting is shared with (read-only). */
export const MEETING_READ_ONLY_MESSAGE =
  'Lecture seule : seule la personne qui a créé cette réunion peut la modifier.';

/**
 * Publishing a meeting into Hub copies it into pages that follow the space's
 * permissions, not the meeting's. Each deployment chooses: only
 * MEETING_HUB_PUBLISHING=enabled turns it on (general ConqrAI deployments);
 * unset or any other value keeps it suspended (La Tête Chercheuse, Strict
 * Private). Off by default, so a missing variable never opens it.
 */
export function isMeetingHubPublishingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.MEETING_HUB_PUBLISHING ?? '').trim().toLowerCase() === 'enabled';
}

/** Refusal while publishing is suspended on this deployment. */
export const MEETING_PUBLISH_SUSPENDED_MESSAGE =
  'La publication dans ConqrHub est suspendue pendant la mise en place du partage privé des réunions.';

export const TEMPLATE_DEFAULT_ADMIN_MESSAGE =
  'Seuls les propriétaires et les administrateurs peuvent changer le modèle par défaut de l’entreprise.';

export const TEMPLATE_READ_ONLY_MESSAGE =
  'Lecture seule : seules la personne qui a créé ce modèle, les propriétaires et les administrateurs peuvent le modifier.';

/** Owner or Admin of the workspace. Takes an actor or a bare role. Used for
 *  company-level settings (default meeting template), never for meetings. */
export function isWorkspaceManager(
  actor: Pick<MeetingActor, 'role'> | string | null | undefined,
): boolean {
  const role = typeof actor === 'string' || actor == null ? actor : actor.role;
  return role === UserRole.OWNER || role === UserRole.ADMIN;
}

/** The person who created the meeting, in its own company. */
export function isMeetingCreator(
  meeting: MeetingOwnership,
  viewer: MeetingAccessViewer,
): boolean {
  if (!viewer?.id || !viewer.workspaceId || !meeting?.userId) return false;
  return (
    meeting.workspaceId === viewer.workspaceId && meeting.userId === viewer.id
  );
}

/**
 * Its creator, or someone it was shared with (sharing, phase 1: a grant to
 * the person or to one of their groups, looked up by meetingSharedWith),
 * always in its own company — whatever their role. A grant never crosses
 * companies, even if a row says so.
 */
export function canReadMeeting(
  meeting: MeetingOwnership,
  viewer: MeetingAccessViewer,
  sharedWithViewer = false,
): boolean {
  if (isMeetingCreator(meeting, viewer)) return true;
  if (!sharedWithViewer || !viewer?.id || !viewer.workspaceId || !meeting?.userId) {
    return false;
  }
  return meeting.workspaceId === viewer.workspaceId;
}

/** The creator alone changes, deletes or shares a meeting; a share is
 *  read-only. Independent of canReadMeeting on purpose. */
export function canEditMeeting(
  meeting: MeetingOwnership,
  actor: MeetingActor,
): boolean {
  return isMeetingCreator(meeting, actor);
}

/**
 * The Hub spaces a meeting belongs to: its own space and the space it was
 * published into. Not an access rule — a space never grants access to a
 * meeting — but used where a meeting is shown next to its spaces.
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

/** Review, evaluate, publish, rename, delete: the creator only (same rule
 *  as canEditMeeting). */
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
