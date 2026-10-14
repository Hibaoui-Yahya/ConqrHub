/**
 * What the Home shows, computed from data the Hub already has. Pure;
 * unit-tested in home-items.test.ts.
 *
 * - "À traiter": unread notifications that ask something of the user
 *   (mentions, approvals, verifications that expire, meetings to review)
 *   and the user's own meetings waiting for review or publication.
 * - "Reprendre": the user's own pages and favourites, most recent first.
 * - "Nouveau dans mes espaces": recent changes made by someone else.
 */

export const HOME_MAX_ROWS = 5;

/** Notification types that call for an action on the Home. */
export const ACTIONABLE_TYPES = new Set([
  "comment.user_mention",
  "page.user_mention",
  "page.approval_requested",
  "page.approval_rejected",
  "page.verification_expiring",
  "page.verification_expired",
  "page.verification_invalidated",
  "meeting.review_needed",
  "meeting.failed",
]);

export type TodoKind =
  | "mention"
  | "approval"
  | "rejected"
  | "verification"
  | "meeting-speakers"
  | "meeting-review"
  | "meeting-failed"
  | "meeting-publish";

export interface TodoItem {
  key: string;
  kind: TodoKind;
  at: string;
  /** Notification to mark read when opened. */
  notificationId?: string;
  pageTitle?: string;
  pageSlugId?: string;
  spaceSlug?: string;
  actorName?: string;
  meetingId?: string;
  meetingTitle?: string;
}

interface NotificationLike {
  id: string;
  type: string;
  readAt: string | null;
  createdAt: string;
  data?: Record<string, unknown> | null;
  actor?: { name: string } | null;
  page?: { title: string; slugId: string } | null;
  space?: { slug: string } | null;
}

interface MeetingLike {
  id: string;
  title: string;
  status: string;
  startedAt: string;
  updatedAt?: string;
  settings?: { publishedBundle?: { meetingPageId?: string } } | null;
}

const KIND_BY_TYPE: Record<string, TodoKind> = {
  "comment.user_mention": "mention",
  "page.user_mention": "mention",
  "page.approval_requested": "approval",
  "page.approval_rejected": "rejected",
  "page.verification_expiring": "verification",
  "page.verification_expired": "verification",
  "page.verification_invalidated": "verification",
  "meeting.review_needed": "meeting-review",
  "meeting.failed": "meeting-failed",
};

const REVIEW_STATUSES = new Set(["awaiting_review"]);
const SPEAKER_STATUSES = new Set(["speakers_pending_review"]);
const FAILED_STATUSES = new Set(["failed", "partially_failed"]);
const DONE_STATUSES = new Set(["completed"]);

/** Highest first: what blocks someone else, then my own work. */
const PRIORITY: Record<TodoKind, number> = {
  approval: 0,
  "meeting-failed": 1,
  "meeting-speakers": 2,
  "meeting-review": 3,
  "meeting-publish": 4,
  mention: 5,
  verification: 6,
  rejected: 7,
};

export function buildTodo(
  notifications: NotificationLike[],
  myMeetings: MeetingLike[],
): TodoItem[] {
  const items: TodoItem[] = [];
  const meetingsSeen = new Set<string>();
  const pagesSeen = new Set<string>();
  for (const n of notifications) {
    if (n.readAt || !ACTIONABLE_TYPES.has(n.type)) continue;
    const kind = KIND_BY_TYPE[n.type];
    const meetingId = typeof n.data?.meetingId === "string" ? (n.data.meetingId as string) : undefined;
    // One row per meeting and per page+kind: repeated notifications collapse.
    const dedupe = meetingId ? `m:${meetingId}` : `p:${n.page?.slugId ?? n.id}:${kind}`;
    if (meetingId ? meetingsSeen.has(meetingId) : pagesSeen.has(dedupe)) continue;
    if (meetingId) meetingsSeen.add(meetingId);
    else pagesSeen.add(dedupe);
    items.push({
      key: n.id,
      kind,
      at: n.createdAt,
      notificationId: n.id,
      pageTitle: n.page?.title,
      pageSlugId: n.page?.slugId,
      spaceSlug: n.space?.slug,
      actorName: n.actor?.name,
      meetingId,
      meetingTitle: typeof n.data?.meetingTitle === "string" ? (n.data.meetingTitle as string) : undefined,
    });
  }
  for (const m of myMeetings) {
    if (meetingsSeen.has(m.id)) continue;
    const published = !!m.settings?.publishedBundle?.meetingPageId;
    let kind: TodoKind | null = null;
    if (SPEAKER_STATUSES.has(m.status)) kind = "meeting-speakers";
    else if (REVIEW_STATUSES.has(m.status)) kind = "meeting-review";
    else if (FAILED_STATUSES.has(m.status)) kind = "meeting-failed";
    else if (DONE_STATUSES.has(m.status) && !published) kind = "meeting-publish";
    if (!kind) continue;
    meetingsSeen.add(m.id);
    items.push({ key: `meeting:${m.id}`, kind, at: m.updatedAt ?? m.startedAt, meetingId: m.id, meetingTitle: m.title });
  }
  return items.sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || b.at.localeCompare(a.at));
}

interface PageLike {
  id: string;
  title: string;
  slugId: string;
  updatedAt: string | Date;
  lastUpdatedById?: string;
  creatorId?: string;
  space?: { slug?: string; name?: string } | null;
}

export interface ResumeItem {
  page: PageLike;
  favorite: boolean;
}

/** My pages and my favourites, deduplicated, most recently updated first. */
export function buildResume(myPages: PageLike[], favorites: PageLike[]): ResumeItem[] {
  const byId = new Map<string, ResumeItem>();
  for (const p of myPages) byId.set(p.id, { page: p, favorite: false });
  for (const p of favorites) {
    const existing = byId.get(p.id);
    byId.set(p.id, { page: existing?.page ?? p, favorite: true });
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.page.updatedAt).getTime() - new Date(a.page.updatedAt).getTime(),
  );
}

/** Recent changes made by someone else (my own edits are in "Reprendre"). */
export function buildNews(recent: PageLike[], myId: string | undefined, exclude: Set<string>): PageLike[] {
  return recent.filter((p) => p.lastUpdatedById !== myId && !exclude.has(p.id));
}

/** The one-line summary under the greeting. */
export function homeSummary(todo: number, news: number): { key: string; values: Record<string, number> } {
  if (todo && news) return { key: "{{todo}} to handle · {{news}} new in your spaces", values: { todo, news } };
  if (todo) return { key: "{{todo}} to handle", values: { todo } };
  if (news) return { key: "Nothing to handle · {{news}} new in your spaces", values: { news } };
  return { key: "You are up to date.", values: {} };
}
