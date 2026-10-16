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

  describe('archive and unarchive', () => {
    it('archives without deleting, hides from the list by default, restores the previous status, notifies nobody', async () => {
      const { service, notifications } = build();
      const id = await addMeeting({ by: creator, status: 'awaiting_review', title: 'À archiver' });
      await service.saveInsight(creator, id, { kind: 'qa', question: 'Q', content: 'R' });
      const archived = await service.archive(creator, id);
      expect(archived).toMatchObject({ status: 'archived', archivedAt: expect.any(Date) });
      expect(await service.archive(creator, id)).toMatchObject({ status: 'archived' }); // idempotent

      const titles = async (opts: any = {}) =>
        (await service.list(ws1, { limit: 100, q: 'À archiver', ...opts }, coworker)).items.map((m: any) => m.id);
      expect(await titles()).not.toContain(id);
      expect(await titles({ archived: 'include' })).toContain(id);
      expect(await titles({ archived: 'only' })).toEqual([id]);
      expect(await titles({ status: 'archived' })).toEqual([id]);

      // Data stays and remains readable.
      expect((await service.getDetail(coworker, id)).meeting.status).toBe('archived');
      expect((await service.listInsights(coworker, id)).items).toHaveLength(1);
      await expect(service.process(creator, id, {})).rejects.toBeInstanceOf(ConflictException);

      const restored = await service.unarchive(creator, id);
      expect(restored).toMatchObject({ status: 'awaiting_review', archivedAt: null });
      expect(await titles()).toContain(id);
      expect(notifications.onTransition).not.toHaveBeenCalled();
    });

    it('needs the edit right, refuses a meeting being recorded or processed', async () => {
      const { service } = build();
      const id = await addMeeting({ by: creator, status: 'completed' });
      await expect(service.archive(coworker, id)).rejects.toThrow(MEETING_READ_ONLY_MESSAGE);
      await service.archive(owner, id);
      await expect(service.unarchive(coworker, id)).rejects.toBeInstanceOf(ForbiddenException);
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
    it('narrows by type, status, date range and owner, never beyond the company', async () => {
      const { service } = build();
      const tag = `Filtre ${randomUUID().slice(0, 8)}`;
      const a = await addMeeting({ by: creator, title: `${tag} A`, meetingType: 'recruitment-interview', status: 'completed', startedAt: new Date('2026-10-01T09:00:00Z') });
      const b = await addMeeting({ by: owner, title: `${tag} B`, meetingType: 'daily-standup', status: 'published', startedAt: new Date('2026-10-10T23:30:00Z') });
      const c = await addMeeting({ by: creator, title: `${tag} C`, meetingType: 'daily-standup', status: 'failed', startedAt: new Date('2026-10-15T09:00:00Z') });
      await addMeeting({ by: foreign, title: `${tag} X`, meetingType: 'daily-standup' });
      const ids = async (opts: any, who: Actor = coworker) =>
        (await service.list(who.workspaceId, { limit: 100, q: tag, ...opts }, who)).items.map((m: any) => m.id).sort();

      expect(await ids({})).toEqual([a, b, c].sort());
      expect(await ids({ type: 'daily-standup' })).toEqual([b, c].sort());
      expect(await ids({ type: 'daily-standup,recruitment-interview' })).toEqual([a, b, c].sort());
      expect(await ids({ status: 'completed,failed' })).toEqual([a, c].sort());
      expect(await ids({ from: '2026-10-02', to: '2026-10-10' })).toEqual([b]);
      expect(await ids({ to: '2026-10-01' })).toEqual([a]);
      expect(await ids({ ownerId: creator.id })).toEqual([a, c].sort());
      // A coworker may filter on anyone of the company (company-wide read);
      // another company's owner id or meetings never appear.
      expect(await ids({ ownerId: foreign.id })).toEqual([]);
      // scope=mine and ownerId intersect.
      expect(await ids({ mine: true, ownerId: owner.id }, creator)).toEqual([]);
      const total = await service.list(ws1, { limit: 1, q: tag, type: 'daily-standup' }, coworker);
      expect(total.total).toBe(2);

      await expect(service.list(ws1, { status: 'done' }, coworker)).rejects.toThrow('Statut inconnu');
      await expect(service.list(ws1, { from: '2026-10-10', to: '2026-10-01' }, coworker)).rejects.toThrow('Période invalide');
    });
  });

  describe('proposal quality', () => {
    const TURNS = [
      'Bonjour à tous, on fait le point sur le budget du projet Atlas.',
      'Marie prépare le plan de recrutement pour vendredi.',
      'Paul enverra le contrat au client lundi prochain.',
    ];
    const proposalsAi = () => ({
      isAvailable: () => true,
      generate: jest.fn(async () => ({
        text: JSON.stringify([
          { title: 'Préparer le plan de recrutement', owner: 'Marie', quote: 'Marie prépare le plan de recrutement', confidence: 0.9 },
          { title: 'Envoyer le contrat au client', owner: 'Paul', quote: 'Paul enverra le contrat au client lundi prochain.', confidence: 0.9 },
        ]),
      })),
    });
    const tokens = { mintForPlane: jest.fn(() => ({ token: 'obo', jti: 'jti-1' })) };

    async function meetingWithTranscript(spaceId: string | null) {
      const id = await addMeeting({ by: creator, spaceId });
      const segments = TURNS.map((text, i) => ({ id: `seg-${i}`, speaker: 'Speaker 1', text, rawText: text, startMs: i * 5000, endMs: i * 5000 + 4000 }));
      await db
        .insertInto('meetingTranscripts')
        .values({
          meetingId: id,
          version: 1,
          kind: 'live',
          status: 'transcribed',
          provider: 'mistral',
          segments: sql`${JSON.stringify(segments)}::jsonb`,
          speakers: sql`'{}'::jsonb`,
        })
        .execute();
      return id;
    }
    async function mappedSpace(projects: Array<[string, string]>) {
      const spaceId = randomUUID();
      await db.insertInto('spaces').values({ id: spaceId, workspaceId: ws1, slug: `s-${spaceId.slice(0, 8)}`, name: 'Atlas' }).execute();
      for (const [planeProjectId, mappingKind] of projects) {
        await db.insertInto('integrationProjectSpaceMappings').values({ workspaceId: ws1, spaceId, planeProjectId, mappingKind }).execute();
      }
      return spaceId;
    }
    const proposals = (id: string) =>
      db.selectFrom('meetingActionProposals').selectAll().where('meetingId', '=', id).orderBy('idempotencyKey').execute();
    const json = (v: any) => (typeof v === 'string' ? JSON.parse(v) : v);
    const generate = async (service: MeetingService, id: string) =>
      (service as any).generateProposals(await meetingRow(id), TURNS.join('\n'), 1, 'fr');

    it('cites the transcript segments, takes the space\'s project and flags a likely duplicate', async () => {
      const plane = {
        isEnabled: () => true,
        searchWorkItems: jest.fn(async ({ query }: { query: string }) => ({
          results: query.includes('contrat')
            ? [{ id: 'wi-9', name: 'Envoyer le contrat au client', project_id: 'proj-1', project__identifier: 'ATL', sequence_id: 9, state__name: 'Todo', state__group: 'unstarted' }]
            : [{ id: 'wi-1', name: 'Budget Atlas', project_id: 'proj-1' }],
        })),
      };
      const { service } = build({ ai: proposalsAi(), plane, delegatedTokens: tokens });
      const id = await meetingWithTranscript(await mappedSpace([['proj-1', 'primary'], ['proj-2', 'secondary']]));
      await generate(service, id);
      const [recruit, contract] = await proposals(id);

      expect(json(recruit.evidence)).toEqual([{ segmentIds: ['seg-1'], quote: 'Marie prépare le plan de recrutement' }]);
      expect(json(contract.evidence)[0].segmentIds).toEqual(['seg-2']);
      expect(json(recruit.payload).projectId).toBe('proj-1');
      expect(json(recruit.validation)).toMatchObject({
        missingFields: [],
        project: { projectId: 'proj-1', source: 'space_mapping' },
      });
      expect(plane.searchWorkItems).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'proj-1' }),
        { delegation: 'obo', correlationId: 'jti-1' },
      );
      expect(tokens.mintForPlane).toHaveBeenCalledWith(
        expect.objectContaining({ hubUserId: creator.id, scope: ['work-item:read'] }),
      );
      expect(json(recruit.duplicateCheck)).toMatchObject({ searched: true, candidates: [], likelyDuplicate: false });
      expect(recruit.riskLevel).toBe('safe');
      expect(json(contract.duplicateCheck)).toMatchObject({
        searched: true,
        likelyDuplicate: true,
        candidates: [{ id: 'wi-9', identifier: 'ATL', sequenceId: 9, similarity: 1 }],
      });
      expect(contract.riskLevel).toBe('normal');
      expect(json(contract.validation).warnings).toContain(
        'Une tâche ConqrPlan semblable existe peut-être déjà : vérifiez avant de créer.',
      );

      // "Approve safe" leaves the likely duplicate to a person.
      const result = await service.approveSafeProposals(creator, id);
      expect(result.approved).toEqual([recruit.id]);
    });

    it('without a mapped space: projectId is the only missing field and Plan being down never blocks', async () => {
      const plane = {
        isEnabled: () => true,
        searchWorkItems: jest.fn(() => new Promise(() => undefined)), // never answers
      };
      const { service } = build({ ai: proposalsAi(), plane, delegatedTokens: tokens });
      (service as any).duplicateCheckTimeoutMs = 50;
      const id = await meetingWithTranscript(null);
      await generate(service, id);
      const rows = await proposals(id);
      expect(rows).toHaveLength(2);
      for (const p of rows) {
        expect(json(p.validation)).toMatchObject({ missingFields: ['projectId'], project: { projectId: null, source: 'no_space' } });
        expect(json(p.duplicateCheck)).toMatchObject({ searched: false, reason: 'timeout' });
        expect(json(p.payload).projectId).toBeUndefined();
      }
      // Plan not connected at all: same, with its own reason.
      const offline = build({ ai: proposalsAi(), plane: { isEnabled: () => false } });
      const other = await meetingWithTranscript(await mappedSpace([['p-a', 'primary'], ['p-b', 'primary']]));
      await generate(offline.service, other);
      const [first] = await proposals(other);
      expect(json(first.duplicateCheck)).toMatchObject({ searched: false, reason: 'plan_not_connected' });
      expect(json(first.validation)).toMatchObject({
        missingFields: ['projectId'],
        project: { source: 'ambiguous', candidates: expect.arrayContaining(['p-a', 'p-b']) },
      });
      expect((await offline.service.approveSafeProposals(creator, other)).approved).toEqual([]);
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
      const transcript = await service.getTranscript(coworker, id);
      expect(transcript.version).toBe(2);
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

    it('lists linkable members of the meeting\'s company only, to editors, with id, name and avatar', async () => {
      const { service } = build();
      const id = await twoSpeakerMeeting();
      const all = await service.listLinkableMembers(creator, id, { limit: 50 });
      const ids = all.items.map((m: any) => m.id);
      expect(ids).toEqual(expect.arrayContaining([owner.id, creator.id, coworker.id]));
      expect(ids).not.toContain(foreign.id);
      expect(Object.keys(all.items[0]).sort()).toEqual(['avatarUrl', 'id', 'name']);
      const found = await service.listLinkableMembers(creator, id, { q: 'colin' });
      expect(found.items.map((m: any) => m.id)).toEqual([coworker.id]);
      const page = await service.listLinkableMembers(owner, id, { limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.hasMore).toBe(true);
      await expect(service.listLinkableMembers(coworker, id)).rejects.toThrow(MEETING_READ_ONLY_MESSAGE);
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
      await service.ingestChunk(creator, started.id, Buffer.from('audio'), {
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
