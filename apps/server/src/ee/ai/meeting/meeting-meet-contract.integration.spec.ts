import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { MeetingTemplateService } from './meeting-template.service';

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

  describe('archive and unarchive', () => {
    it('archives without deleting, hides from the list by default, restores the previous status, notifies nobody', async () => {
      const { service, notifications } = build();
      const id = await addMeeting({ by: creator, status: 'awaiting_review', title: 'À archiver' });
      await service.saveInsight(creator, id, { kind: 'qa', question: 'Q', content: 'R' });
      const archived = await service.archive(creator, id);
      expect(archived).toMatchObject({ status: 'archived', archivedAt: expect.any(Date) });
      expect(await service.archive(creator, id)).toMatchObject({ status: 'archived' }); // idempotent

      const titles = async (opts: any = {}, who: Actor = creator) =>
        (await service.list(ws1, { limit: 100, q: 'À archiver', ...opts }, who)).items.map((m: any) => m.id);
      expect(await titles()).not.toContain(id);
      expect(await titles({ archived: 'include' })).toContain(id);
      expect(await titles({ archived: 'only' })).toEqual([id]);
      expect(await titles({ status: 'archived' })).toEqual([id]);
      // Strict Private: an archived meeting stays its creator's alone.
      expect(await titles({ archived: 'include' }, coworker)).not.toContain(id);

      // Data stays and remains readable by its creator.
      expect((await service.getDetail(creator, id)).meeting.status).toBe('archived');
      expect((await service.listInsights(creator, id)).items).toHaveLength(1);
      await expect(service.getDetail(coworker, id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.process(creator, id, {})).rejects.toBeInstanceOf(ConflictException);

      const restored = await service.unarchive(creator, id);
      expect(restored).toMatchObject({ status: 'awaiting_review', archivedAt: null });
      expect(await titles()).toContain(id);
      expect(notifications.onTransition).not.toHaveBeenCalled();
    });

    it('only its creator archives it, refuses a meeting being recorded or processed', async () => {
      const { service } = build();
      const id = await addMeeting({ by: creator, status: 'completed' });
      // Strict Private: a coworker or a company Owner gets 404, never 403.
      await expect(service.archive(coworker, id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.archive(owner, id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await meetingRow(id)).status).toBe('completed');
      await service.archive(creator, id);
      await expect(service.unarchive(coworker, id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.unarchive(owner, id)).rejects.toBeInstanceOf(NotFoundException);
      for (const status of ['recording', 'analyzing']) {
        const busy = await addMeeting({ by: creator, status });
        await expect(service.archive(creator, busy)).rejects.toMatchObject({
          response: expect.objectContaining({ code: 'meeting_busy' }),
        });
        expect((await meetingRow(busy)).status).toBe(status);
      }
    });
  });

  describe('list filters', () => {
    it('narrows the caller own meetings by type, status, date range and owner, never beyond them', async () => {
      const { service } = build();
      const tag = `Filtre ${randomUUID().slice(0, 8)}`;
      const a = await addMeeting({ by: creator, title: `${tag} A`, meetingType: 'recruitment-interview', status: 'completed', startedAt: new Date('2026-10-01T09:00:00Z') });
      const b = await addMeeting({ by: owner, title: `${tag} B`, meetingType: 'daily-standup', status: 'published', startedAt: new Date('2026-10-10T23:30:00Z') });
      const c = await addMeeting({ by: creator, title: `${tag} C`, meetingType: 'daily-standup', status: 'failed', startedAt: new Date('2026-10-15T09:00:00Z') });
      await addMeeting({ by: foreign, title: `${tag} X`, meetingType: 'daily-standup' });
      const ids = async (opts: any, who: Actor = creator) =>
        (await service.list(who.workspaceId, { limit: 100, q: tag, ...opts }, who)).items.map((m: any) => m.id).sort();

      // Strict Private: the list holds the caller's own meetings only.
      expect(await ids({})).toEqual([a, c].sort());
      expect(await ids({}, owner)).toEqual([b]);
      expect(await ids({}, coworker)).toEqual([]);
      expect(await ids({ type: 'daily-standup' })).toEqual([c]);
      expect(await ids({ type: 'daily-standup,recruitment-interview' })).toEqual([a, c].sort());
      expect(await ids({ status: 'completed,failed' })).toEqual([a, c].sort());
      expect(await ids({ from: '2026-10-02', to: '2026-10-15' })).toEqual([c]);
      expect(await ids({ from: '2026-10-02', to: '2026-10-10' }, owner)).toEqual([b]);
      expect(await ids({ to: '2026-10-01' })).toEqual([a]);
      expect(await ids({ ownerId: creator.id })).toEqual([a, c].sort());
      // ownerId never widens: a colleague's or another company's id matches nothing.
      expect(await ids({ ownerId: owner.id })).toEqual([]);
      expect(await ids({ ownerId: creator.id }, coworker)).toEqual([]);
      expect(await ids({ ownerId: foreign.id })).toEqual([]);
      // The total counts after the access filter, before pagination.
      const total = await service.list(ws1, { limit: 1, q: tag }, creator);
      expect(total.items).toHaveLength(1);
      expect(total.total).toBe(2);
      // List items are light: content is read meeting by meeting.
      await db
        .updateTable('meetings')
        .set({ transcript: 'mes attentes salariales', settings: sql`${JSON.stringify({ evaluation: { status: 'validated' }, template: { id: 't', name: 'Entrevue' } })}::jsonb` })
        .where('id', '=', a)
        .execute();
      const light = (await service.list(ws1, { limit: 100, q: tag }, creator)).items.find((m: any) => m.id === a);
      expect(light).not.toHaveProperty('transcript');
      expect(light).not.toHaveProperty('aiOutputs');
      expect(light).not.toHaveProperty('cost');
      expect(light.settings).toEqual({ template: { id: 't', name: 'Entrevue' } });
      expect((await service.getDetail(creator, a)).meeting.transcript).toBe('mes attentes salariales');

      await expect(service.list(ws1, { status: 'done' }, coworker)).rejects.toThrow('Statut inconnu');
      await expect(service.list(ws1, { from: '2026-10-10', to: '2026-10-01' }, coworker)).rejects.toThrow('Période invalide');
    });
  });

  describe('speakers linked to members', () => {
    async function twoSpeakerMeeting() {
      const id = await addMeeting({ by: creator });
      const segments = [
        { id: 'a', speaker: 'Speaker 1', text: 'Bonjour.', startMs: 0, endMs: 900 },
        { id: 'b', speaker: 'Speaker 2', text: 'Bonjour à vous.', startMs: 1000, endMs: 2000 },
      ];
      const speakers = {
        'Speaker 1': { label: 'Speaker 1', displayName: 'Alice', userId: null, confidence: 1 },
        'Speaker 2': { label: 'Speaker 2', displayName: null, userId: null, confidence: 0 },
      };
      await db
        .insertInto('meetingTranscripts')
        .values({
          meetingId: id,
          version: 1,
          kind: 'live',
          status: 'transcribed',
          provider: 'mistral',
          segments: sql`${JSON.stringify(segments)}::jsonb`,
          speakers: sql`${JSON.stringify(speakers)}::jsonb`,
        })
        .execute();
      return id;
    }
    const versions = async (id: string) =>
      Number(
        (await db.selectFrom('meetingTranscripts').select(sql<number>`count(*)::int`.as('n')).where('meetingId', '=', id).executeTakeFirst())?.n,
      );

    it('links a member, names an unnamed speaker after them, persists it and returns who they are', async () => {
      const { service } = build();
      const id = await twoSpeakerMeeting();
      const result = await service.reviewSpeakers(creator, id, {
        baseVersion: 1,
        userLinks: { 'Speaker 1': owner.id, 'Speaker 2': coworker.id },
        confirm: true,
      });
      expect(result).toMatchObject({ confirmed: true, version: 2, edited: true });
      const transcript = await service.getTranscript(creator, id);
      expect(transcript.version).toBe(2);
      // Being named in a transcript grants no access to it.
      await expect(service.getTranscript(coworker, id)).rejects.toBeInstanceOf(NotFoundException);
      expect(transcript.speakers).toMatchObject({
        'Speaker 1': { userId: owner.id, displayName: 'Alice' }, // a reviewed name is kept
        'Speaker 2': { userId: coworker.id, displayName: 'Colin Coworker' },
      });
      expect(transcript.linkedUsers).toEqual({
        [owner.id]: { id: owner.id, name: 'Odile Owner', avatarUrl: null },
        [coworker.id]: { id: coworker.id, name: 'Colin Coworker', avatarUrl: null },
      });
      // Unlinking with null.
      await service.reviewSpeakers(creator, id, { baseVersion: 2, userLinks: { 'Speaker 1': null }, confirm: true });
      expect((await service.getTranscript(creator, id)).speakers['Speaker 1']).toMatchObject({ userId: null });
    });

    it('refuses another company\'s member, a deactivated member and garbage, without writing a version', async () => {
      const { service } = build();
      const id = await twoSpeakerMeeting();
      const gone = await addUser(ws1, 'member', 'Gaston Gone');
      await db.updateTable('users').set({ deactivatedAt: new Date() }).where('id', '=', gone.id).execute();
      for (const bad of [foreign.id, gone.id, 'not-a-uuid']) {
        await expect(
          service.reviewSpeakers(creator, id, { baseVersion: 1, userLinks: { 'Speaker 2': bad }, confirm: true }),
        ).rejects.toMatchObject({
          status: 400,
          response: expect.objectContaining({ code: 'invalid_user_links', invalid: [bad] }),
        });
      }
      expect(await versions(id)).toBe(1);
    });

    it('lists linkable members of the meeting\'s company only, to its creator, with id, name and avatar', async () => {
      const { service } = build();
      const id = await twoSpeakerMeeting();
      const all = await service.listLinkableMembers(creator, id, { limit: 50 });
      const ids = all.items.map((m: any) => m.id);
      expect(ids).toEqual(expect.arrayContaining([owner.id, creator.id, coworker.id]));
      expect(ids).not.toContain(foreign.id);
      expect(Object.keys(all.items[0]).sort()).toEqual(['avatarUrl', 'id', 'name']);
      const found = await service.listLinkableMembers(creator, id, { q: 'colin' });
      expect(found.items.map((m: any) => m.id)).toEqual([coworker.id]);
      const page = await service.listLinkableMembers(creator, id, { limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.hasMore).toBe(true);
      // Strict Private: the company's members list is not a way into the meeting.
      await expect(service.listLinkableMembers(owner, id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.listLinkableMembers(coworker, id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.listLinkableMembers(foreign, id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('per-meeting language', () => {
    const stt = (detected: string) => ({
      transcribeDiarized: jest.fn(async () => ({
        text: 'Bonjour à tous.',
        language: detected,
        segments: [{ text: 'Bonjour à tous.', startMs: 0, endMs: 900, speakerId: 'a' }],
      })),
    });
    async function recordAndTranscribe(service: MeetingService, languageConfig?: Record<string, unknown>) {
      const started = await service.start(ws1, creator.id, { title: 'Langue', consent: true, languageConfig });
      // A WebM (EBML) header: chunks are sniffed before they are stored.
      const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('audio')]);
      await service.ingestChunk(creator, started.id, webm, {
        source: 'mic',
        sequence: 0,
        startMs: 0,
        durationMs: 1000,
      });
      const row = await meetingRow(started.id);
      await (service as any).transcribeMeeting(started.id, await (service as any).resolveAudioSources(row));
      const tr = await db
        .selectFrom('meetingTranscripts')
        .select(['language', 'processingConfig'])
        .where('meetingId', '=', started.id)
        .executeTakeFirstOrThrow();
      const config = typeof tr.processingConfig === 'string' ? JSON.parse(tr.processingConfig) : tr.processingConfig;
      return { id: started.id, language: tr.language, config };
    }

    it('the language chosen at start wins over detection and over the account default, all the way to the report', async () => {
      await db
        .updateTable('users')
        .set({ settings: sql`${JSON.stringify({ preferences: { meetings: { defaultLanguage: 'en' } } })}::jsonb` })
        .where('id', '=', creator.id)
        .execute();
      const { service } = build({ stt: stt('en') });
      const fr = await recordAndTranscribe(service, { language: 'fr-CA' });
      expect(fr.language).toBe('fr');
      expect(fr.config).toEqual({ language: { requested: 'fr', mode: 'single', providerHint: null, detected: 'en' } });
      expect((await (service as any).localeContext(await meetingRow(fr.id))).language).toBe('fr');

      // No choice: the account default is not forced on transcription; detection stands.
      const auto = await recordAndTranscribe(service);
      expect(auto.language).toBe('en');
      expect(auto.config.language.mode).toBe('auto');
    });

    it('Arabic + English code-switching auto-detects and does not make the report Arabic', async () => {
      const { service } = build({ stt: stt('ar') });
      const mixed = await recordAndTranscribe(service, { language: 'ar_en' });
      expect(mixed.language).toBe('ar'); // what the provider detected
      expect(mixed.config.language).toMatchObject({ requested: 'ar_en', mode: 'code_switching', providerHint: null });
      // The report falls through to the detected language, then the defaults —
      // "ar_en" itself never reads as a report language.
      await db.deleteFrom('meetingTranscripts').where('meetingId', '=', mixed.id).execute();
      expect((await (service as any).localeContext(await meetingRow(mixed.id))).language).not.toBe('ar');
    });
  });

  describe('saved AI insights', () => {
    it('the creator saves a Q&A and an analysis and lists them newest first; nobody else reads them', async () => {
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
      const analysis = await service.saveInsight(creator, id, {
        kind: 'communication-analysis',
        question: 'ignored',
        content: '## Équilibre de parole',
      });
      expect(analysis.question).toBeNull();

      const listed = await service.listInsights(creator, id);
      expect(listed.items.map((i: any) => i.id)).toEqual([analysis.id, qa.id]);
      expect(listed.items.every((i: any) => i.canDelete === true)).toBe(true);
      expect((await service.listInsights(creator, id, 'qa')).items.map((i: any) => i.id)).toEqual([qa.id]);
      await expect(service.listInsights(creator, id, 'summary')).rejects.toBeInstanceOf(BadRequestException);
      // Strict Private: a coworker or a company Owner reads none of them.
      await expect(service.listInsights(coworker, id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.saveInsight(owner, id, { kind: 'qa', question: 'Q', content: 'R' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('a coworker cannot save or delete; another company sees nothing', async () => {
      const { service } = build();
      const id = await addMeeting({ by: creator });
      const saved = await service.saveInsight(creator, id, { kind: 'qa', question: 'Q', content: 'R' });
      await expect(
        service.saveInsight(coworker, id, { kind: 'qa', question: 'Q', content: 'R' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.deleteInsight(coworker, id, saved.id)).rejects.toBeInstanceOf(NotFoundException);
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
