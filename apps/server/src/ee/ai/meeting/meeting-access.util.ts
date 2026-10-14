/**
 * Who may see a meeting. A meeting holds interview transcripts, salaries
 * and evaluations, so it is not workspace-wide:
 * - its author always;
 * - members of the Hub space it belongs to (its space, or the space it was
 *   published into) — the mandate team;
 * - workspace owners and admins (oversight, retention, deletion).
 * Changing a meeting (review, evaluation, publication, deletion) is
 * narrower: only its author and workspace owners/admins (canWriteMeeting).
 * Pure; unit-tested in meeting-access.util.spec.ts.
 */
export interface MeetingAccessSubject {
  userId: string;
  workspaceId: string;
  spaceId?: string | null;
  settings?: unknown;
}

export interface MeetingAccessViewer {
  id: string;
  role?: string | null;
  workspaceId: string;
}

export function meetingSpaceIds(meeting: Pick<MeetingAccessSubject, 'spaceId' | 'settings'>): string[] {
  const settings = (typeof meeting.settings === 'string' ? safeParse(meeting.settings) : meeting.settings) as
    | { publishedBundle?: { spaceId?: unknown } }
    | null
    | undefined;
  const ids = [meeting.spaceId, settings?.publishedBundle?.spaceId]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return [...new Set(ids)];
}

export function isWorkspaceManager(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function canReadMeeting(
  meeting: MeetingAccessSubject,
  viewer: MeetingAccessViewer,
  viewerSpaceIds: readonly string[],
): boolean {
  if (meeting.workspaceId !== viewer.workspaceId) return false;
  if (meeting.userId === viewer.id) return true;
  if (isWorkspaceManager(viewer.role)) return true;
  const spaces = new Set(viewerSpaceIds);
  return meetingSpaceIds(meeting).some((id) => spaces.has(id));
}

/** Review, evaluate, publish, rename, delete: the author or a manager. */
export function canWriteMeeting(
  meeting: Pick<MeetingAccessSubject, 'userId' | 'workspaceId'>,
  viewer: MeetingAccessViewer,
): boolean {
  if (meeting.workspaceId !== viewer.workspaceId) return false;
  return meeting.userId === viewer.id || isWorkspaceManager(viewer.role);
}

export interface MeetingAccessSummary {
  /** Review, evaluate, publish, rename, share, delete. */
  canEdit: boolean;
  isAuthor: boolean;
  /** Spaces whose members can read the meeting (its own, the published one). */
  sharedSpaceIds: string[];
}

export function meetingAccessFor(
  meeting: MeetingAccessSubject,
  viewer: MeetingAccessViewer,
): MeetingAccessSummary {
  return {
    canEdit: canWriteMeeting(meeting, viewer),
    isAuthor: meeting.userId === viewer.id,
    sharedSpaceIds: meetingSpaceIds(meeting),
  };
}

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
