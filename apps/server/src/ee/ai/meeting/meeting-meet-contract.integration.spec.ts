import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { MeetingTemplateService } from './meeting-template.service';
import { MEETING_READ_ONLY_MESSAGE } from './meeting-access.util';

// Collaborators are doubles; keep their ESM editor/SDK dependencies out.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));
jest.mock('./meeting-audio.util', () => ({
  ...jest.requireActual('./meeting-audio.util'),
  mixMeetingPlayback: jest.fn(async () => Buffer.from('combined playback')),
  inspectAudioSignal: jest.fn(async () => null),
}));

/**
 * The routes added for ConqrMeet (MEET_CONTRACT.md) against the real Hub
 * schema: run the Hub migrations into MEETING_TEST_DATABASE_URL first.
 */
const dbUrl = process.env.MEETING_TEST_DATABASE_URL;
const suite = dbUrl ? describe : describe.skip;
jest.setTimeout(60_000);

type Actor = { id: string; role: string; workspaceId: string };

suite('ConqrMeet contract routes', () => {
  let db: Kysely<any>;
  let ws1: string;
  let ws2: string;
  let owner: Actor;
  let creator: Actor;
  let coworker: Actor;
  let foreign: Actor;
  let files: Map<string, Buffer>;

  function build(o: { plane?: any; delegatedTokens?: any; stt?: any; ai?: any } = {}) {
    const storage = {
      upload: jest.fn(async (path: string, b: Buffer) => void files.set(path, b)),
      read: jest.fn(async (path: string) => files.get(path)),
      exists: jest.fn(async (path: string) => files.has(path)),
      delete: jest.fn(async (path: string) => void files.delete(path)),
      getDriverName: () => 'local',
    };
    const notifications = {
      onTransition: jest.fn(async () => undefined),
      onPublished: jest.fn(async () => undefined),
    };
    const service = new MeetingService(
      db as any,
      storage as any,
      (o.stt ?? {}) as any,
      (o.ai ?? { isAvailable: () => false }) as any,
      (o.plane ?? {}) as any,
      (o.delegatedTokens ?? {}) as any,
      { getPlaneAppUrl: () => null, getPlaneWorkspaceSlug: () => null } as any,
      { create: jest.fn(async () => ({ id: randomUUID() })), findById: jest.fn(async () => null) } as any,
      { createForUser: jest.fn(async () => ({ cannot: () => false })) } as any,
      new MeetingTemplateService(db as any),
      notifications as any,
    );
    jest.spyOn(service as any, 'getWorkspaceName').mockResolvedValue('LTC');
    return { service, storage, notifications };
  }

  async function addUser(workspaceId: string, role: string, name = role): Promise<Actor> {
    const id = randomUUID();
    await db
      .insertInto('users')
      .values({ id, email: `${id}@example.test`, name, role, workspaceId })
      .execute();
    return { id, role, workspaceId };
  }

  async function addMeeting(o: {
    by: Actor;
    status?: string;
    meetingType?: string;
    startedAt?: Date;
    title?: string;
    spaceId?: string | null;
  }) {
    const id = randomUUID();
    await db
      .insertInto('meetings')
      .values({
        id,
        workspaceId: o.by.workspaceId,
        userId: o.by.id,
        title: o.title ?? 'Point budget Atlas',
        status: o.status ?? 'awaiting_review',
        captureKind: 'upload',
        meetingType: o.meetingType ?? 'generic-meeting',
        meetingTypeSource: 'user',
        consentConfirmedAt: new Date(),
        spaceId: o.spaceId ?? null,
        startedAt: o.startedAt ?? new Date('2026-10-13T15:05:00Z'),
      })
      .execute();
    return id;
  }

  const meetingRow = (id: string) =>
    db.selectFrom('meetings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({ postgres: (postgres as any)(dbUrl, { max: 5 }) }),
      plugins: [new CamelCasePlugin()],
    });
    ws1 = randomUUID();
    ws2 = randomUUID();
    await db.insertInto('workspaces').values([{ id: ws1, name: 'LTC' }, { id: ws2, name: 'Autre' }]).execute();
    owner = await addUser(ws1, 'owner', 'Odile Owner');
    creator = await addUser(ws1, 'member', 'Carla Creator');
    coworker = await addUser(ws1, 'member', 'Colin Coworker');
    foreign = await addUser(ws2, 'owner', 'Fred Foreign');
    files = new Map();
  });
  afterAll(async () => {
    await db?.destroy();
  });

  describe('saved AI insights', () => {
    it('the creator saves a Q&A and an analysis; every member lists them, newest first, with the author', async () => {
      const { service } = build();
      const id = await addMeeting({ by: creator });
      const qa = await service.saveInsight(creator, id, {
        kind: 'qa',
        question: 'Qui envoie le contrat ?',
        content: 'Paul, lundi.',
        transcriptVersion: 1,
      });
      expect(qa).toMatchObject({
        kind: 'qa',
        question: 'Qui envoie le contrat ?',
        content: 'Paul, lundi.',
        transcriptVersion: 1,
        author: { id: creator.id, name: 'Carla Creator' },
        canDelete: true,
      });
      const analysis = await service.saveInsight(owner, id, {
        kind: 'communication-analysis',
        question: 'ignored',
        content: '## Équilibre de parole',
      });
      expect(analysis.question).toBeNull();

      const listed = await service.listInsights(coworker, id);
      expect(listed.items.map((i: any) => i.id)).toEqual([analysis.id, qa.id]);
      expect(listed.items.every((i: any) => i.canDelete === false)).toBe(true);
      expect((await service.listInsights(coworker, id, 'qa')).items.map((i: any) => i.id)).toEqual([qa.id]);
      await expect(service.listInsights(coworker, id, 'summary')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a coworker cannot save or delete; another company sees nothing', async () => {
      const { service } = build();
      const id = await addMeeting({ by: creator });
      const saved = await service.saveInsight(creator, id, { kind: 'qa', question: 'Q', content: 'R' });
      await expect(
        service.saveInsight(coworker, id, { kind: 'qa', question: 'Q', content: 'R' }),
      ).rejects.toThrow(MEETING_READ_ONLY_MESSAGE);
      await expect(service.deleteInsight(coworker, id, saved.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.listInsights(foreign, id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await service.listInsights(creator, id)).items).toHaveLength(1);
    });

    it('validates in French and deletes only the meeting\'s own items', async () => {
      const { service } = build();
      const id = await addMeeting({ by: creator });
      const other = await addMeeting({ by: creator });
      await expect(service.saveInsight(creator, id, { kind: 'qa', content: 'R' })).rejects.toThrow(
        'La question est obligatoire',
      );
      const saved = await service.saveInsight(creator, other, { kind: 'qa', question: 'Q', content: 'R' });
      await expect(service.deleteInsight(creator, id, saved.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteInsight(creator, id, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
      await service.deleteInsight(creator, other, saved.id);
      expect((await service.listInsights(creator, other)).items).toEqual([]);
    });
  });
});
