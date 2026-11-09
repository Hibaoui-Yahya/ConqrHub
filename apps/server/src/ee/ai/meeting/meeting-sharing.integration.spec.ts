import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { MeetingTemplateService } from './meeting-template.service';
import { MeetingShareService } from './meeting-share.service';
import { MeetingAccessGuard } from './meeting-access.guard';

// Collaborators below are doubles; keep their ESM editor/SDK dependencies out.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));

/**
 * Meeting sharing, phase 1, against the real Hub schema (run the Hub
 * migrations into MEETING_TEST_DATABASE_URL first). Every grant decision is
 * checked through the three doors a reader uses: MeetingAccessGuard (every
 * /:id route), MeetingService (the meeting itself) and the list.
 */
const dbUrl = process.env.MEETING_TEST_DATABASE_URL;
const suite = dbUrl ? describe : describe.skip;

jest.setTimeout(60_000);

type Actor = { id: string; role: string; workspaceId: string };

suite('meetings: sharing, phase 1 (read-only grants to people and groups)', () => {
  let db: Kysely<any>;
  let ws1: string;
  let ws2: string;
  let owner: Actor;
  let admin: Actor;
  let creator: Actor;
  let colleague: Actor;
  let other: Actor;
  let disabled: Actor;
  let foreign: Actor;
  let shares: MeetingShareService;
  let service: MeetingService;
  let guard: MeetingAccessGuard;

  async function addUser(workspaceId: string, role: string, o: { disabled?: boolean } = {}) {
    const id = randomUUID();
    await db
      .insertInto('users')
      .values({
        id,
        email: `${id}@example.test`,
        name: `${role}-${id.slice(0, 4)}`,
        role,
        workspaceId,
        deactivatedAt: o.disabled ? new Date() : null,
      })
      .execute();
    return { id, role, workspaceId };
  }

  async function addGroup(workspaceId: string, members: Actor[], o: { isDefault?: boolean } = {}) {
    const id = randomUUID();
    await db
      .insertInto('groups')
      .values({ id, name: `Groupe ${id.slice(0, 4)}`, workspaceId, isDefault: !!o.isDefault })
      .execute();
    if (members.length) {
      await db
        .insertInto('groupUsers')
        .values(members.map((m) => ({ groupId: id, userId: m.id })))
        .execute();
    }
    return id;
  }

  async function addMeeting(by: Actor) {
    const id = randomUUID();
    await db
      .insertInto('meetings')
      .values({
        id,
        workspaceId: by.workspaceId,
        userId: by.id,
        title: 'Comité de direction',
        status: 'completed',
        captureKind: 'upload',
        meetingType: 'generic-meeting',
        meetingTypeSource: 'user',
        audioStoragePrefix: `meetings/${id}`,
        audioManifest: sql`'{}'::jsonb`,
        settings: sql`'{}'::jsonb`,
        aiOutputs: sql`${JSON.stringify({ summary: 'Résumé du comité.' })}::jsonb`,
        startedAt: new Date('2026-11-02T14:00:00Z'),
      })
      .execute();
    return id;
  }

  const ctx = (id: string, who: Actor, method = 'GET') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          params: { id },
          user: { user: { id: who.id, role: who.role }, workspace: { id: who.workspaceId } },
        }),
      }),
    }) as any;

  /** Whether `who` can read the meeting through each door; all must agree. */
  async function reads(meetingId: string, who: Actor): Promise<boolean> {
    const viaGuard = await guard.canActivate(ctx(meetingId, who)).then(
      () => true,
      (e) => {
        if (e instanceof NotFoundException) return false;
        throw e;
      },
    );
    const viaService = await service.getDetail(who, meetingId).then(
      () => true,
      (e) => {
        if (e instanceof NotFoundException) return false;
        throw e;
      },
    );
    const listed = await service.list(who.workspaceId, { shared: true, limit: 100 }, who);
    const viaList = listed.items.some((m: any) => m.id === meetingId);
    expect([meetingId, who.id, viaGuard, viaService]).toEqual([meetingId, who.id, viaList, viaList]);
    return viaGuard;
  }

  const events = (meetingId: string) =>
    db
      .selectFrom('meetingShareAudit')
      .select(['action', 'actorId', 'userId', 'groupId'])
      .where('meetingId', '=', meetingId)
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
  const timeline = (meetingId: string) =>
    db
      .selectFrom('meetingProcessingEvents')
      .select('event')
      .where('meetingId', '=', meetingId)
      .execute();

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({ postgres: (postgres as any)(dbUrl, { max: 5 }) }),
      plugins: [new CamelCasePlugin()],
    });
    ws1 = randomUUID();
    ws2 = randomUUID();
    await db.insertInto('workspaces').values([{ id: ws1, name: 'LTC' }, { id: ws2, name: 'Autre' }]).execute();
    owner = await addUser(ws1, 'owner');
    admin = await addUser(ws1, 'admin');
    creator = await addUser(ws1, 'member');
    colleague = await addUser(ws1, 'member');
    other = await addUser(ws1, 'member');
    disabled = await addUser(ws1, 'member', { disabled: true });
    foreign = await addUser(ws2, 'owner');
    shares = new MeetingShareService(db as any);
    guard = new MeetingAccessGuard(db as any);
    service = new MeetingService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      new MeetingTemplateService(db as any),
      {} as any,
    );
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('shares nothing by default: colleagues, Admins and Owners get 404', async () => {
    const m = await addMeeting(creator);
    for (const who of [colleague, other, admin, owner, foreign]) {
      expect(await reads(m, who)).toBe(false);
    }
    // The creator reads it in their own list, not in "shared with me".
    const mine = await service.list(ws1, { limit: 100 }, creator);
    expect(mine.items.map((i: any) => i.id)).toContain(m);
    const sharedWithCreator = await service.list(ws1, { shared: true, limit: 100 }, creator);
    expect(sharedWithCreator.items.map((i: any) => i.id)).not.toContain(m);
  });

  it('a direct grant lets that person read everything, read-only; taking it back stops it', async () => {
    const m = await addMeeting(creator);
    const added = await shares.add(creator, m, { userIds: [colleague.id] });
    expect(added.items).toEqual([
      expect.objectContaining({ kind: 'user', targetId: colleague.id, memberCount: null }),
    ]);

    expect(await reads(m, colleague)).toBe(true);
    expect(await reads(m, other)).toBe(false);
    expect(await reads(m, owner)).toBe(false);

    const detail = await service.getDetail(colleague, m);
    expect(detail.meeting).toEqual(expect.objectContaining({ canEdit: false, access: 'shared' }));
    const creatorView = await service.getDetail(creator, m);
    expect(creatorView.meeting).toEqual(expect.objectContaining({ canEdit: true, access: 'owner' }));

    const listed = await service.list(ws1, { shared: true, limit: 100 }, colleague);
    const item: any = listed.items.find((i: any) => i.id === m);
    expect(item).toEqual(expect.objectContaining({ access: 'shared', canEdit: false }));
    expect(item.ownerName).toMatch(/^member-/);
    // Never in the colleague's own list.
    const theirs = await service.list(ws1, { limit: 100 }, colleague);
    expect(theirs.items.map((i: any) => i.id)).not.toContain(m);

    // Read-only: every change is refused (403), sharing included.
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      await expect(guard.canActivate(ctx(m, colleague, method))).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(shares.list(colleague, m)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(shares.targets(colleague, m)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(shares.add(colleague, m, { userIds: [other.id] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(colleague, m, { title: 'Volé' })).rejects.toBeInstanceOf(ForbiddenException);
    // Someone it is not shared with learns nothing (404).
    await expect(shares.list(other, m)).rejects.toBeInstanceOf(NotFoundException);
    await expect(shares.add(owner, m, { userIds: [owner.id] })).rejects.toBeInstanceOf(NotFoundException);

    await shares.remove(creator, m, added.items[0].id);
    expect(await reads(m, colleague)).toBe(false);
    expect((await shares.list(creator, m)).items).toEqual([]);
    await expect(shares.remove(creator, m, added.items[0].id)).rejects.toBeInstanceOf(NotFoundException);

    expect(await events(m)).toEqual([
      { action: 'added', actorId: creator.id, userId: colleague.id, groupId: null },
      { action: 'removed', actorId: creator.id, userId: colleague.id, groupId: null },
    ]);
    // The processing timeline is untouched: a share never dates pipeline
    // activity (stale-run detection reads its last event).
    expect(await timeline(m)).toEqual([]);
  });

  it('a group grant follows the group live: joining reads, leaving or a deleted group stops', async () => {
    const m = await addMeeting(creator);
    const group = await addGroup(ws1, [colleague]);
    const added = await shares.add(creator, m, { groupIds: [group] });
    expect(added.items).toEqual([expect.objectContaining({ kind: 'group', targetId: group, memberCount: 1 })]);

    expect(await reads(m, colleague)).toBe(true);
    expect(await reads(m, other)).toBe(false);

    await db.insertInto('groupUsers').values({ groupId: group, userId: other.id }).execute();
    expect(await reads(m, other)).toBe(true);

    await db.deleteFrom('groupUsers').where('groupId', '=', group).where('userId', '=', colleague.id).execute();
    expect(await reads(m, colleague)).toBe(false);
    expect(await reads(m, other)).toBe(true);

    await db.updateTable('groups').set({ deletedAt: new Date() }).where('id', '=', group).execute();
    expect(await reads(m, other)).toBe(false);
  });

  it('never grants through a default group (the whole company), even with a row naming it', async () => {
    const m = await addMeeting(creator);
    const everyone = await addGroup(ws1, [colleague, other, owner], { isDefault: true });
    await expect(shares.add(creator, m, { groupIds: [everyone] })).rejects.toBeInstanceOf(BadRequestException);
    const targets = await shares.targets(creator, m);
    expect(targets.groups.map((g) => g.id)).not.toContain(everyone);

    await db
      .insertInto('meetingShares')
      .values({ meetingId: m, workspaceId: ws1, groupId: everyone, createdBy: creator.id })
      .execute();
    for (const who of [colleague, other, owner]) {
      expect(await reads(m, who)).toBe(false);
    }
  });

  it('refuses the whole request for a stranger, a disabled account, the creator or a bad id', async () => {
    const m = await addMeeting(creator);
    const foreignGroup = await addGroup(ws2, [foreign]);
    for (const input of [
      { userIds: [foreign.id] },
      { userIds: [disabled.id] },
      { userIds: [creator.id] },
      { userIds: [colleague.id, 'pas-un-id'] },
      { userIds: [colleague.id, randomUUID()] },
      { groupIds: [foreignGroup] },
      { groupIds: [randomUUID()] },
      {},
      { userIds: [], groupIds: [] },
    ]) {
      await expect(shares.add(creator, m, input)).rejects.toBeInstanceOf(BadRequestException);
    }
    // All or nothing: the valid colleague of a refused request got nothing.
    expect((await shares.list(creator, m)).items).toEqual([]);
    expect(await reads(m, colleague)).toBe(false);
    // Too many at once.
    const many = Array.from({ length: 51 }, () => randomUUID());
    await expect(shares.add(creator, m, { userIds: many })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sharing again is a no-op, and a grant never crosses companies', async () => {
    const m = await addMeeting(creator);
    await shares.add(creator, m, { userIds: [colleague.id] });
    const again = await shares.add(creator, m, { userIds: [colleague.id.toUpperCase()] });
    expect(again.items).toHaveLength(1);
    expect((await events(m)).filter((e) => e.action === 'added')).toHaveLength(1);

    // A row with the foreign user's id cannot be made (other company's
    // users are refused); even forced, the guard checks the company.
    await db
      .insertInto('meetingShares')
      .values({ meetingId: m, workspaceId: ws2, userId: foreign.id, createdBy: creator.id })
      .execute();
    expect(await reads(m, foreign)).toBe(false);
  });

  it('lists people and groups the creator may share with, never their e-mail nor themselves', async () => {
    const m = await addMeeting(creator);
    const group = await addGroup(ws1, [colleague, other]);
    await shares.add(creator, m, { userIds: [colleague.id] });
    const t = await shares.targets(creator, m, { limit: 50 });
    const userIds = t.users.map((u) => u.id);
    expect(userIds).toContain(colleague.id);
    expect(userIds).not.toContain(creator.id);
    expect(userIds).not.toContain(disabled.id);
    expect(userIds).not.toContain(foreign.id);
    expect(t.users.find((u) => u.id === colleague.id)?.shared).toBe(true);
    expect(t.users.find((u) => u.id === other.id)?.shared).toBe(false);
    expect(t.groups.find((g) => g.id === group)).toEqual(
      expect.objectContaining({ memberCount: 2, shared: false }),
    );
    for (const u of t.users) expect(Object.keys(u).sort()).toEqual(['avatarUrl', 'id', 'name', 'shared']);
    const byEmail = await shares.targets(creator, m, { q: colleague.id.slice(0, 8) });
    expect(byEmail.users.map((u) => u.id)).toEqual([colleague.id]);
  });

  it('a deleted meeting is invisible to everyone it was shared with; a hard delete removes the grants', async () => {
    const m = await addMeeting(creator);
    await shares.add(creator, m, { userIds: [colleague.id] });
    await db.updateTable('meetings').set({ deletedAt: new Date() }).where('id', '=', m).execute();
    expect(await reads(m, colleague)).toBe(false);
    await expect(shares.list(creator, m)).rejects.toBeInstanceOf(NotFoundException);

    await db.deleteFrom('meetings').where('id', '=', m).execute();
    const left = await db.selectFrom('meetingShares').select('id').where('meetingId', '=', m).execute();
    expect(left).toEqual([]);
    expect(await events(m)).toEqual([]);
  });
});
