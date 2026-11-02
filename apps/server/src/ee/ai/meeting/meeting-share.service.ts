import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  canReadMeeting,
  isMeetingCreator,
  isMeetingId,
  MEETING_READ_ONLY_MESSAGE,
  type MeetingActor,
} from './meeting-access.util';
import { MAX_SHARE_TARGETS, meetingSharedWith, splitIds } from './meeting-share.util';

export interface MeetingShareItem {
  id: string;
  kind: 'user' | 'group';
  targetId: string;
  name: string | null;
  avatarUrl: string | null;
  /** Members of the group today (groups only). */
  memberCount: number | null;
  createdAt: Date | string;
}

/**
 * Meeting sharing, phase 1 (design: ConqrHub page "Conception — Partage des
 * réunions dans ConqrMeet (phase 1)"). The creator of a meeting lets active
 * colleagues, or the members of a group of the company, read it; and takes
 * it back. Only the creator sees or changes the grants. Default groups (the
 * whole company) are never offered nor accepted. Every change is written to
 * meeting_share_audit (not to the processing timeline, whose last event
 * dates pipeline activity).
 */
@Injectable()
export class MeetingShareService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * The meeting, if the actor created it. Someone it is shared with gets
   * 403 (read-only); anyone else 404, as for every meeting route.
   */
  private async getOwnMeeting(actor: MeetingActor, meetingId: string) {
    if (!isMeetingId(meetingId)) throw new NotFoundException('Meeting not found');
    const meeting = await this.db
      .selectFrom('meetings')
      .select(['id', 'userId', 'workspaceId'])
      .where('id', '=', meetingId)
      .where('workspaceId', '=', actor.workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (isMeetingCreator(meeting, actor)) return meeting;
    const shared = await meetingSharedWith(this.db, meetingId, actor);
    if (canReadMeeting(meeting, actor, shared)) {
      throw new ForbiddenException(MEETING_READ_ONLY_MESSAGE);
    }
    throw new NotFoundException('Meeting not found');
  }

  /** The grants of a meeting, people first then groups, by name. */
  async list(actor: MeetingActor, meetingId: string): Promise<{ items: MeetingShareItem[] }> {
    const meeting = await this.getOwnMeeting(actor, meetingId);
    return { items: await this.items(meeting.id, meeting.workspaceId) };
  }

  private async items(meetingId: string, workspaceId: string): Promise<MeetingShareItem[]> {
    const rows = await this.db
      .selectFrom('meetingShares')
      .leftJoin('users', 'users.id', 'meetingShares.userId')
      .leftJoin('groups', 'groups.id', 'meetingShares.groupId')
      .select([
        'meetingShares.id as id',
        'meetingShares.userId as userId',
        'meetingShares.groupId as groupId',
        'meetingShares.createdAt as createdAt',
        'users.name as userName',
        'users.avatarUrl as avatarUrl',
        'groups.name as groupName',
        (eb) =>
          eb
            .selectFrom('groupUsers')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('groupUsers.groupId', '=', 'meetingShares.groupId')
            .as('memberCount'),
      ])
      .where('meetingShares.meetingId', '=', meetingId)
      .where('meetingShares.workspaceId', '=', workspaceId)
      .execute();
    return rows
      .map((r) => ({
        id: r.id,
        kind: (r.userId ? 'user' : 'group') as 'user' | 'group',
        targetId: (r.userId ?? r.groupId) as string,
        name: (r.userId ? r.userName : r.groupName) ?? null,
        avatarUrl: r.userId ? (r.avatarUrl ?? null) : null,
        memberCount: r.groupId ? Number(r.memberCount ?? 0) : null,
        createdAt: r.createdAt,
      }))
      .sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === 'user' ? -1 : 1) ||
          (a.name ?? '').localeCompare(b.name ?? '', 'fr'),
      );
  }

  /**
   * Who the creator may share with: active colleagues (not themselves) and
   * the live, non-default groups of the company, matched by name (people
   * also by e-mail, never returned). `shared` marks the ones already granted.
   */
  async targets(
    actor: MeetingActor,
    meetingId: string,
    opts: { q?: string; limit?: number } = {},
  ) {
    const meeting = await this.getOwnMeeting(actor, meetingId);
    const limit = Math.min(Math.max(Math.floor(Number(opts.limit) || 20), 1), 50);
    const q = (opts.q ?? '').trim().slice(0, 100);
    const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

    let users = this.db
      .selectFrom('users')
      .select(['id', 'name', 'avatarUrl'])
      .where('workspaceId', '=', meeting.workspaceId)
      .where('id', '!=', meeting.userId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null);
    if (pattern) {
      users = users.where((eb) =>
        eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]),
      );
    }
    let groups = this.db
      .selectFrom('groups')
      .select([
        'id',
        'name',
        (eb) =>
          eb
            .selectFrom('groupUsers')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('groupUsers.groupId', '=', 'groups.id')
            .as('memberCount'),
      ])
      .where('workspaceId', '=', meeting.workspaceId)
      .where('deletedAt', 'is', null)
      .where('isDefault', '=', false);
    if (pattern) groups = groups.where('name', 'ilike', pattern);

    const [userRows, groupRows, granted] = await Promise.all([
      users.orderBy(sql`lower(coalesce(name, ''))`).orderBy('id').limit(limit + 1).execute(),
      groups.orderBy(sql`lower(name)`).orderBy('id').limit(limit + 1).execute(),
      this.db
        .selectFrom('meetingShares')
        .select(['userId', 'groupId'])
        .where('meetingId', '=', meeting.id)
        .execute(),
    ]);
    const grantedUsers = new Set(granted.map((g) => g.userId).filter(Boolean));
    const grantedGroups = new Set(granted.map((g) => g.groupId).filter(Boolean));
    return {
      users: userRows.slice(0, limit).map((u) => ({
        id: u.id,
        name: u.name ?? null,
        avatarUrl: u.avatarUrl ?? null,
        shared: grantedUsers.has(u.id),
      })),
      groups: groupRows.slice(0, limit).map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: Number(g.memberCount ?? 0),
        shared: grantedGroups.has(g.id),
      })),
      hasMore: userRows.length > limit || groupRows.length > limit,
    };
  }

  /**
   * Grants read access to people and groups. All or nothing: a malformed id,
   * a stranger, a disabled account, the creator, an unknown, deleted or
   * default group refuses the whole request (400). Granting again is a no-op.
   */
  async add(
    actor: MeetingActor,
    meetingId: string,
    input: { userIds?: unknown; groupIds?: unknown },
  ): Promise<{ items: MeetingShareItem[] }> {
    const meeting = await this.getOwnMeeting(actor, meetingId);
    const users = splitIds(input?.userIds);
    const groups = splitIds(input?.groupIds);
    const total = users.ids.length + groups.ids.length;
    if (total === 0 && !users.malformed.length && !groups.malformed.length) {
      throw new BadRequestException('Choisissez au moins une personne ou un groupe.');
    }
    if (total > MAX_SHARE_TARGETS) {
      throw new BadRequestException(
        `Au plus ${MAX_SHARE_TARGETS} personnes ou groupes à la fois.`,
      );
    }

    const [userRows, groupRows] = await Promise.all([
      users.ids.length
        ? this.db
            .selectFrom('users')
            .select('id')
            .where('id', 'in', users.ids)
            .where('workspaceId', '=', meeting.workspaceId)
            .where('deletedAt', 'is', null)
            .where('deactivatedAt', 'is', null)
            .execute()
        : Promise.resolve([] as { id: string }[]),
      groups.ids.length
        ? this.db
            .selectFrom('groups')
            .select('id')
            .where('id', 'in', groups.ids)
            .where('workspaceId', '=', meeting.workspaceId)
            .where('deletedAt', 'is', null)
            .where('isDefault', '=', false)
            .execute()
        : Promise.resolve([] as { id: string }[]),
    ]);
    const okUsers = new Set(userRows.map((r) => r.id));
    const okGroups = new Set(groupRows.map((r) => r.id));
    const invalidUsers = [
      ...users.malformed,
      ...users.ids.filter((id) => !okUsers.has(id) || id === meeting.userId),
    ];
    const invalidGroups = [...groups.malformed, ...groups.ids.filter((id) => !okGroups.has(id))];
    if (invalidUsers.length || invalidGroups.length) {
      throw new BadRequestException({
        message:
          'Partage impossible : certaines personnes ou certains groupes ne peuvent pas recevoir cette réunion.',
        invalidUserIds: invalidUsers,
        invalidGroupIds: invalidGroups,
      });
    }

    const rows = [
      ...users.ids.map((userId) => ({ userId, groupId: null as string | null })),
      ...groups.ids.map((groupId) => ({ userId: null as string | null, groupId })),
    ].map((r) => ({
      meetingId: meeting.id,
      workspaceId: meeting.workspaceId,
      userId: r.userId,
      groupId: r.groupId,
      role: 'viewer',
      createdBy: actor.id,
    }));
    await this.db.transaction().execute(async (trx) => {
      // ON CONFLICT DO NOTHING covers both partial unique indexes: sharing
      // again with the same person or group changes nothing.
      const inserted = await trx
        .insertInto('meetingShares')
        .values(rows)
        .onConflict((oc) => oc.doNothing())
        .returning(['userId', 'groupId'])
        .execute();
      if (inserted.length) {
        await trx
          .insertInto('meetingShareAudit')
          .values(
            inserted.map((r) => ({
              meetingId: meeting.id,
              workspaceId: meeting.workspaceId,
              actorId: actor.id,
              action: 'added',
              userId: r.userId,
              groupId: r.groupId,
            })),
          )
          .execute();
      }
    });
    return { items: await this.items(meeting.id, meeting.workspaceId) };
  }

  /** Takes a grant back; access stops at once. */
  async remove(actor: MeetingActor, meetingId: string, shareId: string): Promise<void> {
    const meeting = await this.getOwnMeeting(actor, meetingId);
    if (!isMeetingId(shareId)) throw new NotFoundException('Partage introuvable.');
    await this.db.transaction().execute(async (trx) => {
      const removed = await trx
        .deleteFrom('meetingShares')
        .where('id', '=', shareId)
        .where('meetingId', '=', meeting.id)
        .returning(['userId', 'groupId'])
        .executeTakeFirst();
      if (!removed) throw new NotFoundException('Partage introuvable.');
      await trx
        .insertInto('meetingShareAudit')
        .values({
          meetingId: meeting.id,
          workspaceId: meeting.workspaceId,
          actorId: actor.id,
          action: 'removed',
          userId: removed.userId,
          groupId: removed.groupId,
        })
        .execute();
    });
  }
}
