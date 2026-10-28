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
import { Queue, Worker } from 'bullmq';
import { MeetingService } from './meeting.service';
import { MeetingTemplateService } from './meeting-template.service';
import { MeetingPipelineProcessor } from './meeting-pipeline.processor';
import { BUILTIN_TEMPLATES } from './meeting-template.util';
import { MEETING_PUBLISH_SUSPENDED_MESSAGE } from './meeting-access.util';
import { pipelineJobId, STALE_FAILURE_MESSAGE, StaleRunError } from './meeting-processing.util';
import { mixMeetingPlayback } from './meeting-audio.util';
import { QueueJob } from '../../../integrations/queue/constants';

// Collaborators below are doubles; keep their ESM editor/SDK dependencies out.
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
  // No ffmpeg in unit runs: "cannot measure" keeps the existing path.
  inspectAudioSignal: jest.fn(async () => null),
}));

/**
 * LTC-01 / Strict Private / LTC-04 against the real Hub schema (run the Hub
 * migrations into MEETING_TEST_DATABASE_URL first) and, for the durable
 * queue, a real Redis (MEETING_TEST_REDIS_URL).
 */
const dbUrl = process.env.MEETING_TEST_DATABASE_URL;
const redisUrl = process.env.MEETING_TEST_REDIS_URL;
const suite = dbUrl ? describe : describe.skip;
const redisSuite = dbUrl && redisUrl ? describe : describe.skip;

jest.setTimeout(60_000);

type Actor = { id: string; role: string; workspaceId: string };

const FRENCH_TURNS = [
  { text: 'Bonjour à tous, on fait le point sur le budget du projet Atlas.', speakerId: 'a' },
  { text: 'Le budget est de quarante-cinq mille dollars, pas cinquante.', speakerId: 'a' },
  { text: 'Nous décidons de lancer la phase deux en novembre.', speakerId: 'a' },
  { text: 'Marie prépare le plan de recrutement pour vendredi.', speakerId: 'a' },
  { text: 'Paul enverra le contrat au client lundi prochain.', speakerId: 'a' },
  { text: 'On se revoit jeudi pour valider les embauches, deux personnes au total.', speakerId: 'a' },
];

function sttDouble(opts: { twoVoices?: boolean } = {}) {
  return {
    transcribeDiarized: jest.fn(async () => ({
      text: FRENCH_TURNS.map((t) => t.text).join(' '),
      language: 'fr',
      segments: FRENCH_TURNS.map((t, i) => ({
        text: t.text,
        startMs: i * 5000,
        endMs: i * 5000 + 4000,
        // Two unnamed voices: identification pauses for a human review.
        speakerId: opts.twoVoices ? (i % 2 ? 'b' : 'a') : t.speakerId,
      })),
    })),
    transcribeAndCorrect: jest.fn(),
  };
}

type AiHandler = (args: { system?: string; prompt: string }) => Promise<string> | string;

/** Resolvers of AI calls the tests leave hanging (a "crashed" run). */
const hung: Array<(text: string) => void> = [];
const hangForever = () => new Promise<string>((resolve) => hung.push(resolve));

async function waitFor(check: () => Promise<boolean> | boolean, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
}

/** Records every pipeline write refused by the run fence. */
function trackFencing(service: MeetingService): string[] {
  const refused: string[] = [];
  const original = (service as any).write.bind(service);
  jest.spyOn(service as any, 'write').mockImplementation((fn: any) =>
    original(fn).catch((e: Error) => {
      refused.push(e.name);
      throw e;
    }),
  );
  return refused;
}

/** An AI double whose first summary call waits until the test releases it. */
function aiWithLateSummary(answer: AiHandler = defaultAi()) {
  const gate: { release?: (text: string) => void } = {};
  let first = true;
  const ai = aiDouble((args) => {
    if (first && (args.prompt ?? '').includes('structured markdown summary')) {
      first = false;
      return new Promise<string>((resolve) => {
        gate.release = resolve;
        hung.push(resolve);
      });
    }
    return answer(args);
  });
  return { ai, gate };
}

const GOOD_REPORT = JSON.stringify({
  sections: {
    summary: 'Point budget du projet Atlas : 45 000 $.',
    decisions: '- Lancer la phase deux en novembre.',
    actions: '- [Marie] Plan de recrutement (vendredi)\n- [Paul] Envoyer le contrat (lundi)',
    next_steps: '- Valider les deux embauches jeudi.',
  },
});

function defaultAi(report: () => string = () => GOOD_REPORT): AiHandler {
  return ({ system = '', prompt }) => {
    if (system.includes('Tu rédiges le compte rendu')) return report();
    if (system.includes('extract concrete')) {
      return JSON.stringify([
        { title: 'Préparer le plan de recrutement', owner: 'Marie', quote: 'Marie prépare le plan', confidence: 0.9 },
        { title: 'Envoyer le contrat', owner: 'Paul', quote: 'Paul enverra le contrat', confidence: 0.9 },
      ]);
    }
    if (system.includes('You classify')) return '{"type":"generic-meeting","confidence":0.9}';
    if (system.includes('You correct punctuation')) return '{}';
    if (system.includes('You identify who the speakers')) return '{}';
    return prompt.includes('decisions') ? '- Lancer la phase deux.' : '- Point clé.';
  };
}

function aiDouble(handler: AiHandler) {
  const ai = {
    calls: [] as Array<{ system?: string; prompt: string }>,
    isAvailable: () => true,
    generate: jest.fn(async (args: { system?: string; prompt: string }) => {
      ai.calls.push(args);
      return { text: await handler(args) };
    }),
  };
  return ai;
}

suite('meetings: Strict Private access, deletion, durable processing', () => {
  let db: Kysely<any>;
  let files: Map<string, Buffer>;
  let storage: any;
  let ws1: string;
  let ws2: string;
  let owner: Actor;
  let admin: Actor;
  let creator: Actor;
  let coworker: Actor;
  let foreign: Actor;
  let spaceId: string;

  const userOf = (a: Actor) => ({ id: a.id, role: a.role }) as any;

  function build(opts: {
    ai?: ReturnType<typeof aiDouble>;
    stt?: ReturnType<typeof sttDouble>;
    queue?: Queue;
    canCreatePages?: boolean;
  } = {}) {
    const pages = {
      create: jest.fn(async () => ({ id: randomUUID() })),
      findById: jest.fn(async () => null),
      updatePageContent: jest.fn(),
    };
    const spaceAbility = {
      createForUser: jest.fn(async () => ({
        cannot: () => opts.canCreatePages === false,
      })),
    };
    const notifications = {
      transitions: [] as Array<{ meetingId: string; to: string }>,
      onTransition: jest.fn(async (meetingId: string, _from: string | null, to: string) => {
        notifications.transitions.push({ meetingId, to });
      }),
      onPublished: jest.fn(async () => undefined),
    };
    const service = new MeetingService(
      db as any,
      storage,
      (opts.stt ?? sttDouble()) as any,
      (opts.ai ?? aiDouble(defaultAi())) as any,
      {} as any,
      {} as any,
      {} as any,
      pages as any,
      spaceAbility as any,
      new MeetingTemplateService(db as any),
      notifications as any,
      opts.queue,
    );
    jest.spyOn(service as any, 'getWorkspaceName').mockResolvedValue('LTC');
    return { service, pages, spaceAbility, notifications };
  }

  async function addUser(workspaceId: string, role: string): Promise<Actor> {
    const id = randomUUID();
    await db
      .insertInto('users')
      .values({ id, email: `${id}@example.test`, name: role, role, workspaceId })
      .execute();
    return { id, role, workspaceId };
  }

  async function addMeeting(o: {
    by: Actor;
    status?: string;
    consent?: boolean;
    withAudio?: boolean;
    withTranscript?: boolean;
    template?: boolean;
    lastEventAgoMs?: number;
    deleted?: boolean;
  }) {
    const id = randomUUID();
    const originalPath = `meetings/${id}/original/a.webm`;
    if (o.withAudio !== false) files.set(originalPath, Buffer.from('audio'));
    const spec = BUILTIN_TEMPLATES['generic-meeting'].draft;
    await db
      .insertInto('meetings')
      .values({
        id,
        workspaceId: o.by.workspaceId,
        userId: o.by.id,
        title: 'Point budget Atlas',
        status: o.status ?? 'awaiting_review',
        captureKind: 'upload',
        meetingType: 'generic-meeting',
        meetingTypeSource: 'user',
        consentConfirmedAt: o.consent === false ? null : new Date(),
        audioStoragePrefix: `meetings/${id}`,
        audioManifest: sql`${JSON.stringify(
          o.withAudio === false ? {} : { originalPath, mime: 'audio/webm' },
        )}::jsonb`,
        settings: sql`${JSON.stringify(
          o.template
            ? { template: { id: 'generic-meeting', name: 'Réunion générale', version: 1, spec } }
            : {},
        )}::jsonb`,
        aiOutputs: sql`${JSON.stringify({ summary: 'Résumé initial.' })}::jsonb`,
        startedAt: new Date('2026-10-13T15:05:00Z'),
        deletedAt: o.deleted ? new Date() : null,
      })
      .execute();
    await db
      .insertInto('meetingProcessingEvents')
      .values({
        meetingId: id,
        event: 'transition',
        fromStatus: null,
        toStatus: o.status ?? 'awaiting_review',
        detail: sql`'{}'::jsonb`,
        createdAt: new Date(Date.now() - (o.lastEventAgoMs ?? 0)),
      })
      .execute();
    if (o.withTranscript) {
      const segments = FRENCH_TURNS.map((t, i) => ({
        id: `s${i}`,
        speaker: 'Speaker 1',
        channel: 'mic',
        text: t.text,
        rawText: t.text,
        startMs: i * 5000,
        endMs: i * 5000 + 4000,
        confidence: null,
        attribution: 'acoustic',
      }));
      await db
        .insertInto('meetingTranscripts')
        .values({
          meetingId: id,
          version: 1,
          kind: 'live',
          status: 'transcribed',
          provider: 'mistral',
          language: 'fr',
          segments: sql`${JSON.stringify(segments)}::jsonb`,
          speakers: sql`${JSON.stringify({ 'Speaker 1': { label: 'Speaker 1', displayName: null, userId: null, confidence: null } })}::jsonb`,
        })
        .execute();
    }
    return id;
  }

  const meetingRow = (id: string) =>
    db.selectFrom('meetings').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  const count = async (table: string, meetingId: string, extra?: (q: any) => any) => {
    let q: any = db.selectFrom(table as any).select(sql<number>`count(*)::int`.as('n')).where('meetingId', '=', meetingId);
    if (extra) q = extra(q);
    return Number((await q.executeTakeFirst())?.n ?? 0);
  };

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({
        postgres: (postgres as any)(dbUrl, { max: 5 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
    ws1 = randomUUID();
    ws2 = randomUUID();
    await db.insertInto('workspaces').values([{ id: ws1, name: 'LTC' }, { id: ws2, name: 'Autre' }]).execute();
    owner = await addUser(ws1, 'owner');
    admin = await addUser(ws1, 'admin');
    creator = await addUser(ws1, 'member');
    coworker = await addUser(ws1, 'member');
    foreign = await addUser(ws2, 'owner');
    spaceId = randomUUID();
    await db.insertInto('spaces').values({ id: spaceId, workspaceId: ws1, slug: `general-${spaceId.slice(0, 6)}`, name: 'General' }).execute();
  });
  afterAll(async () => {
    // Runs left hanging on purpose are released first; their writes are
    // refused by the fence, then the pool closes (no timeout race).
    for (const release of hung.splice(0)) release('- libéré');
    await new Promise((r) => setTimeout(r, 500));
    await db?.destroy();
  });
  beforeEach(() => {
    files = new Map();
    storage = {
      upload: jest.fn(async (p: string, b: Buffer) => void files.set(p, b)),
      read: jest.fn(async (p: string) => {
        if (!files.has(p)) throw new Error('missing file');
        return files.get(p);
      }),
      readStream: jest.fn(async (p: string) => {
        const { Readable } = await import('node:stream');
        return Readable.from(files.get(p) ?? Buffer.alloc(0));
      }),
      exists: jest.fn(async (p: string) => files.has(p)),
      delete: jest.fn(async (p: string) => void files.delete(p)),
      getDriverName: () => 'local',
    };
  });

  describe('Strict Private (LTC phase 0) — the creator alone reads, changes and deletes', () => {
    let meetingId: string;
    let proposalId: string;
    let insightId: string;
    beforeEach(async () => {
      meetingId = await addMeeting({ by: creator, withTranscript: true });
      proposalId = randomUUID();
      await db
        .insertInto('meetingActionProposals')
        .values({
          id: proposalId,
          meetingId,
          workspaceId: ws1,
          transcriptVersion: 1,
          kind: 'work_item',
          targetApp: 'conqrplane',
          title: 'Envoyer le contrat',
          payload: sql`'{}'::jsonb`,
          reason: 'x',
          evidence: sql`'[]'::jsonb`,
          confidence: 0.9,
          riskLevel: 'safe',
          status: 'proposed',
          idempotencyKey: `test:${proposalId}`,
        })
        .execute();
      insightId = randomUUID();
      await db
        .insertInto('meetingInsights')
        .values({ id: insightId, meetingId, workspaceId: ws1, kind: 'qa', question: 'Budget ?', content: '45 000 $', createdBy: creator.id })
        .execute();
    });

    /** Every read route of the controller (GET /:id/*), as a service call. */
    const reads = (service: MeetingService): Array<[string, (a: Actor, id: string) => Promise<unknown>]> => [
      ['detail', (a, id) => service.getDetail(a, id)],
      ['capture', (a, id) => service.getCaptureState(a, id)],
      ['status', (a, id) => service.getStatus(a, id)],
      ['transcript', (a, id) => service.getTranscript(a, id)],
      ['linkable-members', (a, id) => service.listLinkableMembers(a, id, {})],
      ['documents', (a, id) => service.listDocuments(a, id)],
      ['proposals', (a, id) => service.listProposals(a, id)],
      ['insights', (a, id) => service.listInsights(a, id)],
      ['audio', (a, id) => service.getAudioUrl(a, id)],
      ['audio-file', (a, id) => service.getAudioFile(a, id)],
    ];

    /** Every write route of the controller (POST/PATCH/DELETE /:id/*). */
    const writes = (service: MeetingService): Array<[string, (a: Actor, id: string) => Promise<unknown>]> => [
      ['update', (a, id) => service.update(a, id, { title: 'Renommée' })],
      ['archive', (a, id) => service.archive(a, id)],
      ['unarchive', (a, id) => service.unarchive(a, id)],
      ['markers', (a, id) => service.saveMarkers(a, id, [{ atMs: 1000, kind: 'moment' }])],
      ['ai-output', (a, id) => service.saveAiOutput(a, id, 'summary', 'x')],
      ['insight-save', (a, id) => service.saveInsight(a, id, { kind: 'qa', question: 'Q ?', content: 'R' })],
      ['insight-delete', (a, id) => service.deleteInsight(a, id, insightId)],
      ['process', (a, id) => service.process(a, id, {})],
      ['retry', (a, id) => service.retryProcessing(a, id)],
      ['speakers', (a, id) => service.reviewSpeakers(a, id, { baseVersion: 1, renames: { 'Speaker 1': 'X' }, confirm: true })],
      ['remove-echoes', (a, id) => service.removeChannelEchoes(a, id, 1)],
      ['attribute', (a, id) => service.attributeSpeakers(a, id, 1)],
      ['evaluation', (a, id) => service.generateEvaluation(a, id, undefined)],
      ['evaluation-save', (a, id) => service.saveEvaluation(a, id, {})],
      ['approve', (a, id) => service.approveProposal(a, id, proposalId, {})],
      ['reject', (a, id) => service.rejectProposal(a, id, proposalId)],
      ['approve-safe', (a, id) => service.approveSafeProposals(a, id)],
      ['review', (a, id) => service.reviewMeeting(a, id, 'complete')],
      ['publish', (a, id) => service.publishBundle(a.workspaceId, id, { spaceId }, userOf(a))],
      ['publish-doc', (a, id) => service.publishDocument(userOf(a), a.workspaceId, id, randomUUID(), { spaceId })],
      ['stop', (a, id) => service.stop(a, id)],
      ['chunk', (a, id) => service.ingestChunk(a, id, Buffer.from('x'), { source: 'mic', sequence: 0, startMs: 0, durationMs: 1 })],
      ['delete', (a, id) => service.delete(a, id)],
    ];

    const outcome = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e) => e?.constructor?.name,
      );

    it('lets the creator read everything of the meeting', async () => {
      const { service } = build();
      const detail = await service.getDetail(creator, meetingId);
      expect(detail.meeting.canEdit).toBe(true);
      expect((await service.getTranscript(creator, meetingId)).segments).toHaveLength(6);
      expect(await service.listProposals(creator, meetingId)).toHaveLength(1);
      await expect(service.listInsights(creator, meetingId)).resolves.toBeDefined();
      expect((await service.getAudioFile(creator, meetingId)).mime).toBe('audio/webm');
      const listed = await service.list(ws1, { limit: 100 }, creator);
      expect(listed.items.find((m) => m.id === meetingId)?.canEdit).toBe(true);
    });

    it('answers "not found" to a colleague, an Admin, an Owner and another company on every read', async () => {
      const { service } = build();
      for (const who of [coworker, admin, owner, foreign]) {
        for (const [name, read] of reads(service)) {
          expect([who.role, name, await outcome(read(who, meetingId))]).toEqual([
            who.role,
            name,
            NotFoundException.name,
          ]);
        }
      }
    });

    it('answers "not found" to a colleague, an Admin and an Owner on every write, and changes nothing', async () => {
      const { service, pages } = build();
      for (const who of [coworker, admin, owner]) {
        for (const [name, write] of writes(service)) {
          expect([who.role, name, await outcome(write(who, meetingId))]).toEqual([
            who.role,
            name,
            NotFoundException.name,
          ]);
        }
      }
      const row = await meetingRow(meetingId);
      expect(row.title).toBe('Point budget Atlas');
      expect(row.deletedAt).toBeNull();
      expect(row.archivedAt).toBeNull();
      expect(row.status).toBe('awaiting_review');
      expect(await count('meetingTranscripts', meetingId)).toBe(1);
      expect(await count('meetingInsights', meetingId)).toBe(1);
      const proposal = await db.selectFrom('meetingActionProposals').select('status').where('id', '=', proposalId).executeTakeFirstOrThrow();
      expect(proposal.status).toBe('proposed');
      expect(pages.create).not.toHaveBeenCalled();
    });

    it('lists, searches and filters only the caller\'s own meetings, whatever the role or the filters', async () => {
      const { service } = build();
      const coworkers = await addMeeting({ by: coworker, withTranscript: true });
      const admins = await addMeeting({ by: admin });
      const deleted = await addMeeting({ by: creator, deleted: true });
      const elsewhere = await addMeeting({ by: foreign });
      await db.updateTable('meetings').set({ transcript: 'Le budget est de quarante-cinq mille dollars.' }).where('id', 'in', [meetingId, coworkers]).execute();
      const ids = async (who: Actor, opts: Record<string, unknown> = {}) =>
        (await service.list(who.workspaceId, { limit: 100, ...opts } as any, who)).items.map((m) => m.id);

      expect(await ids(creator)).toContain(meetingId);
      expect(await ids(creator)).not.toContain(coworkers);
      for (const who of [coworker, admin, owner]) {
        const seen = await ids(who);
        expect(seen).not.toContain(meetingId);
        expect(seen).not.toContain(deleted);
        expect(seen).not.toContain(elsewhere);
      }
      expect(await ids(coworker)).toEqual([coworkers]);
      expect(await ids(admin)).toEqual([admins]);
      expect(await ids(owner)).toEqual([]);
      // Filters never widen: another person's id, "mine" or not, a word
      // of the title or of the transcript.
      expect(await ids(owner, { ownerId: creator.id })).toEqual([]);
      expect(await ids(owner, { mine: false })).toEqual([]);
      expect(await ids(owner, { q: 'Atlas' })).toEqual([]);
      expect(await ids(coworker, { q: 'quarante' })).toEqual([coworkers]);
      expect(await ids(creator, { q: 'quarante' })).toEqual([meetingId]);
      // No caller, no meetings.
      expect((await service.list(ws1, { limit: 100 })).items).toEqual([]);
      expect(await ids(foreign)).toEqual([elsewhere]);
    });

    it("never returns another person's meeting or transcript, whatever the search, filters or pagination", async () => {
      const { service } = build();
      const secret = `SECRETCOLLEGUE${randomUUID().slice(0, 8)}`;
      const theirs: string[] = [];
      for (const status of ['awaiting_review', 'completed', 'failed']) {
        theirs.push(await addMeeting({ by: coworker, status }));
      }
      const archivedTheirs = await addMeeting({ by: coworker, status: 'completed' });
      theirs.push(archivedTheirs);
      await db.updateTable('meetings').set({ archivedAt: new Date() }).where('id', '=', archivedTheirs).execute();
      await db.updateTable('meetings').set({ transcript: `Le salaire visé est confidentiel. ${secret}` }).where('id', 'in', theirs).execute();
      const mineExtra = await addMeeting({ by: creator, status: 'completed' });
      await db.updateTable('meetings').set({ transcript: 'Point budget sans secret.' }).where('id', 'in', [meetingId, mineExtra]).execute();

      const searches = ['', 'Atlas', secret, secret.slice(0, 6), 'salaire', '%', '_', "' or 1=1 --"];
      const archived = [undefined, 'exclude', 'include', 'only'] as const;
      const owners = [undefined, coworker.id, creator.id];
      const statuses = [undefined, 'awaiting_review', 'completed,failed,archived'];
      let calls = 0;
      for (const q of searches) for (const arch of archived) for (const ownerId of owners) for (const status of statuses) {
        const res = await service.list(ws1, { limit: 100, q, archived: arch as any, ownerId, status, mine: false }, creator);
        calls++;
        const wire = JSON.stringify(res);
        expect([q, arch, ownerId, status, wire.includes(secret)]).toEqual([q, arch, ownerId, status, false]);
        expect(res.items.every((m) => m.userId === creator.id)).toBe(true);
        expect(res.items.some((m) => theirs.includes(m.id))).toBe(false);
        expect(res.total).toBe(res.items.length);
      }
      expect(calls).toBe(searches.length * archived.length * owners.length * statuses.length);

      // Pagination: walking every page, one meeting at a time, yields exactly
      // the caller's own meetings, and the total never counts anyone else's.
      for (const who of [creator, coworker, admin, owner]) {
        const seen: string[] = [];
        let total = -1;
        for (let offset = 0; offset < 50; offset++) {
          const page = await service.list(ws1, { limit: 1, offset, archived: 'include' }, who);
          total = page.total;
          if (!page.items.length) break;
          expect(page.items[0].userId).toBe(who.id);
          seen.push(page.items[0].id);
        }
        const own = await db.selectFrom('meetings').select('id').where('userId', '=', who.id).where('workspaceId', '=', ws1).where('deletedAt', 'is', null).execute();
        expect(seen.sort()).toEqual(own.map((m) => m.id).sort());
        expect(total).toBe(own.length);
      }
    });

    it('suspends publishing into Hub, even for the creator with page rights, and creates no page', async () => {
      const { service, pages } = build();
      for (const publish of [
        () => service.publishBundle(ws1, meetingId, { spaceId }, userOf(creator)),
        () => service.publishDocument(userOf(creator), ws1, meetingId, randomUUID(), { spaceId }),
      ]) {
        const err = await publish().then(() => null, (e) => e);
        expect([err?.constructor?.name, err?.message]).toEqual([
          ForbiddenException.name,
          MEETING_PUBLISH_SUSPENDED_MESSAGE,
        ]);
      }
      expect(pages.create).not.toHaveBeenCalled();
    });

    it('lets the creator change and delete their own meeting', async () => {
      const { service } = build();
      expect((await service.update(creator, meetingId, { title: 'Par la créatrice' })).title).toBe('Par la créatrice');
      await service.delete(creator, meetingId);
      expect((await meetingRow(meetingId)).deletedAt).not.toBeNull();
    });

    it('treats another company, an unknown id and a malformed id the same: not found', async () => {
      const { service } = build();
      const calls = [...reads(service), ...writes(service)];
      for (const [, call] of calls) {
        await expect(call(foreign, meetingId)).rejects.toBeInstanceOf(NotFoundException);
        await expect(call(creator, randomUUID())).rejects.toBeInstanceOf(NotFoundException);
        await expect(call(creator, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
      }
      expect((await service.list(ws2, {}, foreign)).items.map((m) => m.id)).not.toContain(meetingId);
    });
  });

  describe('the call heard through the speakers (microphone echo)', () => {
    const remote = "Ah oui, c'est ça, dans tous les onglets du profil.";
    async function withEcho(status: string) {
      const id = await addMeeting({ by: creator, status });
      const segments = [
        { id: 'sys', speaker: 'Speaker 1', channel: 'system', text: remote, rawText: remote, startMs: 7000, endMs: 9000, confidence: null, attribution: 'acoustic' },
        { id: 'echo', speaker: 'Speaker 2', channel: 'mic', text: remote, rawText: remote, startMs: 7050, endMs: 9050, confidence: null, attribution: 'acoustic' },
        { id: 'own', speaker: 'Speaker 3', channel: 'mic', text: 'Je note, je regarde ça cet après-midi.', rawText: 'Je note, je regarde ça cet après-midi.', startMs: 10000, endMs: 12000, confidence: null, attribution: 'acoustic' },
      ];
      const speakers = Object.fromEntries(
        ['Speaker 1', 'Speaker 2', 'Speaker 3'].map((label) => [label, { label, displayName: null, userId: null, confidence: null }]),
      );
      await db
        .insertInto('meetingTranscripts')
        .values({
          meetingId: id,
          version: 1,
          kind: 'canonical',
          status: 'confirmed',
          provider: 'mistral',
          language: 'fr',
          segments: sql`${JSON.stringify(segments)}::jsonb`,
          speakers: sql`${JSON.stringify(speakers)}::jsonb`,
        })
        .execute();
      return id;
    }

    it('counts the repeated lines, removes them as a new version and keeps the original', async () => {
      const id = await withEcho('speakers_pending_review');
      const { service } = build();
      expect((await service.getTranscript(creator, id)).echoLines).toBe(1);
      // Kept private: a colleague cannot even see the meeting.
      await expect(service.getTranscript(coworker, id)).rejects.toBeInstanceOf(NotFoundException);

      const result = await service.removeChannelEchoes(creator, id, 1);
      expect(result).toEqual({ removed: 1, version: 2, reanalysis: false });

      const v2 = await service.getTranscript(creator, id);
      expect(v2.version).toBe(2);
      expect((v2.segments as Array<{ id: string }>).map((s) => s.id)).toEqual(['sys', 'own']);
      expect(Object.keys(v2.speakers)).toEqual(['Speaker 1', 'Speaker 3']);
      expect(v2.echoLines).toBe(0);
      const v1 = await service.getTranscript(creator, id, 1);
      expect(v1.segments).toHaveLength(3);
      const text = (await meetingRow(id)).transcript as string;
      expect(text.split(remote).length - 1).toBe(1);
      expect(await count('meetingProcessingEvents', id, (q) => q.where('event', '=', 'channel_echo_removed'))).toBe(1);
      // Speakers not confirmed yet: their confirmation starts the analysis.
      expect((await meetingRow(id)).status).toBe('speakers_pending_review');

      // A stale base version is refused; nothing left writes nothing.
      await expect(service.removeChannelEchoes(creator, id, 1)).rejects.toBeInstanceOf(ConflictException);
      expect(await service.removeChannelEchoes(creator, id, 2)).toEqual({ removed: 0, version: 2, reanalysis: false });
      expect(await count('meetingTranscripts', id)).toBe(2);
    });

    it('re-runs the analysis when it had already run on the doubled transcript', async () => {
      const id = await withEcho('awaiting_review');
      const { service } = build();
      const result = await service.removeChannelEchoes(creator, id, 1);
      expect(result).toEqual({ removed: 1, version: 2, reanalysis: true });
      for (let i = 0; i < 100 && (await meetingRow(id)).status !== 'awaiting_review'; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect((await meetingRow(id)).status).toBe('awaiting_review');
      expect(await count('meetingProcessingEvents', id, (q) => q.where('toStatus', '=', 'analyzing'))).toBeGreaterThan(0);
    });
  });

  describe('LTC-04 — a deleted meeting is gone from every normal path', () => {
    it('detail, transcript, status, audio, documents, proposals, edits, processing and recovery all ignore it', async () => {
      const ai = aiDouble(defaultAi());
      const stt = sttDouble();
      const { service } = build({ ai, stt });
      const meetingId = await addMeeting({ by: creator, withTranscript: true });
      await service.delete(creator, meetingId);
      const row = await meetingRow(meetingId);
      expect(row.deletedAt).not.toBeNull();
      expect(files.size).toBe(1); // stored audio retained, never purged here

      for (const who of [creator, admin, owner]) {
        for (const call of [
          () => service.getDetail(who, meetingId),
          () => service.getTranscript(who, meetingId),
          () => service.getStatus(who, meetingId),
          () => service.getAudioFile(who, meetingId),
          () => service.getAudioUrl(who, meetingId),
          () => service.listDocuments(who, meetingId),
          () => service.listProposals(who, meetingId),
          () => service.update(who, meetingId, { title: 'x' }),
          () => service.process(who, meetingId, {}),
          () => service.retryProcessing(who, meetingId),
          () => service.delete(who, meetingId),
        ]) {
          await expect(call()).rejects.toBeInstanceOf(NotFoundException);
        }
      }
      expect((await service.list(ws1, {}, owner)).items.map((m) => m.id)).not.toContain(meetingId);

      // A job queued before the deletion does nothing.
      await db.updateTable('meetings').set({ status: 'analyzing' }).where('id', '=', meetingId).execute();
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('skipped');
      expect(ai.generate).not.toHaveBeenCalled();
      expect(stt.transcribeDiarized).not.toHaveBeenCalled();
      // The recovery sweep never touches it either.
      await db.updateTable('meetingProcessingEvents').set({ createdAt: new Date(Date.now() - 3600_000) }).where('meetingId', '=', meetingId).execute();
      expect(await service.markStalledProcessing()).not.toContain(meetingId);
      expect((await meetingRow(meetingId)).status).toBe('analyzing');
    });
  });

  describe('LTC-01 — durable, resumable, idempotent processing', () => {
    it('resumes after a crash that happened after transcription without calling the provider again', async () => {
      const ai = aiDouble(defaultAi());
      const stt = sttDouble();
      const { service } = build({ ai, stt });
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio', withTranscript: true, template: true });
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
      expect(stt.transcribeDiarized).not.toHaveBeenCalled();
      expect(await count('meetingTranscripts', meetingId)).toBe(1);
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('awaiting_review');
      expect(row.failureReason).toBeNull();
    });

    it('is idempotent: running the analysis twice keeps one draft report and one set of proposals', async () => {
      const { service } = build();
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 });
      await db.updateTable('meetings').set({ status: 'analyzing' }).where('id', '=', meetingId).execute();
      await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 });
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      expect(await count('meetingActionProposals', meetingId)).toBe(2);
      const proposals = await db.selectFrom('meetingActionProposals').select(['workspaceId']).where('meetingId', '=', meetingId).execute();
      expect(proposals.every((p) => p.workspaceId === ws1)).toBe(true);
    });

    it('fresh run: transcribes once, writes French outputs and a validated template report', async () => {
      const ai = aiDouble(defaultAi());
      const stt = sttDouble();
      const { service } = build({ ai, stt });
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio', template: true });
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1);
      expect((await meetingRow(meetingId)).status).toBe('awaiting_review');
      const summaryCall = ai.calls.find((c) => c.prompt.includes('structured markdown summary'));
      expect(summaryCall?.system).toContain('Rédige toute ta réponse en français');
      expect(summaryCall?.prompt).toContain('## Points clés');
      const [doc] = await db.selectFrom('meetingDocuments').selectAll().where('meetingId', '=', meetingId).execute();
      expect(doc.contentMarkdown).toContain('Point budget du projet Atlas : 45 000 $.');
      expect(doc.contentMarkdown).not.toContain('_Rien de consigné._');
      expect(doc.contentMarkdown).toContain('13 octobre 2026');
      const structured = typeof doc.structured === 'string' ? JSON.parse(doc.structured) : doc.structured;
      expect(structured.generation.status).toBe('complete');
      expect((await service.listDocuments(creator, meetingId))[0].publishBlocker).toBeNull();
    });

    it('a malformed report becomes a visible partial failure, keeps the previous draft and never publishes', async () => {
      const ai = aiDouble(defaultAi(() => 'Désolé, voici le compte rendu : {sections: summary -> ...'));
      const { service, pages } = build({ ai });
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      await db.insertInto('meetingDocuments').values({
        meetingId, title: 'Ancien', contentMarkdown: '# Ancien', structured: sql`'{"generation":{"status":"complete"}}'::jsonb`,
        templateId: 'generic-meeting', templateVersion: 1, transcriptVersion: 1, status: 'draft',
      }).execute();
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('partially_failed');
      expect(row.failureReason).toContain('n’a pas pu être généré');
      const reportCalls = ai.calls.filter((c) => (c.system ?? '').includes('Tu rédiges le compte rendu'));
      expect(reportCalls).toHaveLength(3); // bounded retries, then stop
      expect(reportCalls[1].prompt).toContain('Ta réponse précédente était inutilisable');
      const docs = await db.selectFrom('meetingDocuments').select(['title']).where('meetingId', '=', meetingId).execute();
      expect(docs.map((d) => d.title)).toEqual(['Ancien']);
      // The person can retry; the status panel says so.
      const status = await service.getStatus(creator, meetingId);
      expect(status.processing).toMatchObject({ state: 'failed', canRetry: true });
      // An incomplete legacy report is refused at publication.
      await db.updateTable('meetingDocuments').set({ structured: sql`'{"sections":{"summary":"_Rien de consigné._","actions":"_Rien de consigné._"}}'::jsonb` }).where('meetingId', '=', meetingId).execute();
      const [doc] = await db.selectFrom('meetingDocuments').select('id').where('meetingId', '=', meetingId).execute();
      // Publishing into Hub is suspended (Strict Private, phase 0): refused
      // before the publish blocker is even looked at.
      await expect(service.publishDocument(userOf(creator), ws1, meetingId, doc.id, { spaceId })).rejects.toBeInstanceOf(ForbiddenException);
      expect(pages.create).not.toHaveBeenCalled();
    });

    it('retries a transient provider error, then fails in French on the last attempt', async () => {
      const stt = sttDouble();
      stt.transcribeDiarized.mockRejectedValue(new Error('provider 503'));
      stt.transcribeAndCorrect.mockRejectedValue(new Error('provider 503'));
      const { service, notifications } = build({ stt });
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio' });
      await expect(service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).rejects.toThrow('provider 503');
      expect((await meetingRow(meetingId)).status).toBe('normalizing_audio');
      expect(await count('meetingProcessingEvents', meetingId, (q) => q.where('event', '=', 'processing_retry_scheduled'))).toBe(1);
      expect(await service.runPipelineJob(meetingId, { attempt: 3, maxAttempts: 3 })).toBe('failed');
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('failed');
      expect(row.failureReason).toContain('après plusieurs tentatives');
      expect(row.failureReason).toContain('provider 503');
      // The creator hears about it once, on the final failure only.
      expect(notifications.onTransition.mock.calls.filter((c) => c[0] === meetingId && c[2] === 'failed')).toEqual([
        [meetingId, 'normalizing_audio', 'failed', { error: row.failureReason }],
      ]);
    });

    it('fails at once, without retries, when there is no audio or no consent', async () => {
      const stt = sttDouble();
      const { service } = build({ stt });
      const noAudio = await addMeeting({ by: creator, status: 'normalizing_audio', withAudio: false });
      expect(await service.runPipelineJob(noAudio, { attempt: 1, maxAttempts: 3 })).toBe('failed');
      expect((await meetingRow(noAudio)).failureReason).toContain('Aucun audio');
      const noConsent = await addMeeting({ by: creator, status: 'normalizing_audio', consent: false });
      expect(await service.runPipelineJob(noConsent, { attempt: 1, maxAttempts: 3 })).toBe('failed');
      expect((await meetingRow(noConsent)).failureReason).toContain('consentement');
      expect(stt.transcribeDiarized).not.toHaveBeenCalled();
    });

    it('marks only stalled processing as interrupted; recordings, reviews, recent and deleted runs stay', async () => {
      const { service, notifications } = build();
      const hour = 3600_000;
      const stuck = await addMeeting({ by: creator, status: 'normalizing_audio', lastEventAgoMs: hour });
      const recording = await addMeeting({ by: creator, status: 'recording', lastEventAgoMs: hour });
      const review = await addMeeting({ by: creator, status: 'speakers_pending_review', lastEventAgoMs: hour });
      const recent = await addMeeting({ by: creator, status: 'analyzing', lastEventAgoMs: 60_000 });
      const gone = await addMeeting({ by: creator, status: 'normalizing_audio', lastEventAgoMs: hour, deleted: true });
      const marked = await service.markStalledProcessing();
      expect(marked).toContain(stuck);
      for (const id of [recording, review, recent, gone]) expect(marked).not.toContain(id);
      const row = await meetingRow(stuck);
      expect(row.status).toBe('failed');
      expect(row.failureReason).toBe(STALE_FAILURE_MESSAGE);
      expect(await service.markStalledProcessing()).not.toContain(stuck); // once
      expect(notifications.onTransition.mock.calls.filter((c) => c[0] === stuck)).toEqual([
        [stuck, 'normalizing_audio', 'failed', { error: STALE_FAILURE_MESSAGE }],
      ]);
      for (const id of [recording, review, recent, gone]) {
        expect(notifications.onTransition.mock.calls.some((c) => c[0] === id)).toBe(false);
      }
      expect((await meetingRow(recording)).status).toBe('recording');
      expect((await meetingRow(review)).status).toBe('speakers_pending_review');
      expect((await meetingRow(recent)).status).toBe('analyzing');
    });

    it('lets the creator resume an interrupted run where it stopped; coworkers cannot', async () => {
      const ai = aiDouble(defaultAi());
      const stt = sttDouble();
      const { service } = build({ ai, stt });
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio', lastEventAgoMs: 3600_000, template: true });
      // Still in a processing status but stale: the panel offers the retry.
      const status = await service.getStatus(creator, meetingId);
      expect(status.processing).toMatchObject({ state: 'stale', canRetry: true });
      await expect(service.retryProcessing(coworker, meetingId)).rejects.toBeInstanceOf(NotFoundException);
      const res = await service.retryProcessing(creator, meetingId);
      expect(res).toEqual({ status: 'normalizing_audio', retried: true });
      // Without a queue the run happens in-process; wait for it.
      for (let i = 0; i < 100 && (await meetingRow(meetingId)).status !== 'awaiting_review'; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect((await meetingRow(meetingId)).status).toBe('awaiting_review');
      await waitFor(async () => (await meetingRow(meetingId)).processingRunId === null);
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1);
      // A meeting that is not stuck cannot be "retried".
      await expect(service.retryProcessing(creator, meetingId)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('a run that timed out keeps computing but never commits; the provider answering late changes nothing', async () => {
      const { ai, gate } = aiWithLateSummary();
      const { service } = build({ ai });
      const refused = trackFencing(service);
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      await expect(
        service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3, timeoutMs: 300 }),
      ).rejects.toThrow('durée maximale');
      // The timed-out run lost its token in the same transaction as the event.
      expect((await meetingRow(meetingId)).processingRunId).toBeNull();
      expect(await count('meetingProcessingEvents', meetingId, (q) => q.where('event', '=', 'processing_retry_scheduled'))).toBe(1);

      // BullMQ's next attempt finishes the meeting.
      expect(await service.runPipelineJob(meetingId, { attempt: 2, maxAttempts: 3 })).toBe('done');
      const done = await meetingRow(meetingId);
      expect(done.status).toBe('awaiting_review');
      expect(done.processingRunId).toBeNull();
      const events = await count('meetingProcessingEvents', meetingId);

      // Now the provider answers the first run.
      gate.release!('ZOMBIE SUMMARY');
      await waitFor(() => refused.includes('StaleRunError'));
      await new Promise((r) => setTimeout(r, 300));
      const after = await meetingRow(meetingId);
      expect(after.status).toBe('awaiting_review');
      expect(JSON.stringify(after.aiOutputs)).not.toContain('ZOMBIE');
      expect(await count('meetingProcessingEvents', meetingId)).toBe(events);
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      expect(await count('meetingActionProposals', meetingId)).toBe(2);
    });

    it('two workers on one meeting (BullMQ lock lost): the old run cannot overwrite the new run\'s failure', async () => {
      const report = defaultAi(() => 'pas du json');
      const { ai, gate } = aiWithLateSummary(report);
      const { service } = build({ ai });
      const refused = trackFencing(service);
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      const firstWorker = service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 });
      await waitFor(() => !!gate.release);

      // The second worker claims the run and ends with a failed report.
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
      const failed = await meetingRow(meetingId);
      expect(failed.status).toBe('partially_failed');
      const events = await count('meetingProcessingEvents', meetingId);

      gate.release!('ZOMBIE SUMMARY');
      await expect(firstWorker).resolves.toBe('superseded');
      expect(refused).toContain('StaleRunError');
      const after = await meetingRow(meetingId);
      expect(after.status).toBe('partially_failed');
      expect(after.failureReason).toBe(failed.failureReason);
      expect(JSON.stringify(after.aiOutputs)).not.toContain('ZOMBIE');
      expect(await count('meetingProcessingEvents', meetingId)).toBe(events);
    });

    it('a person\'s new request and a deletion both fence a run still computing', async () => {
      const { ai, gate } = aiWithLateSummary();
      const { service } = build({ ai });
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      const run = service.runPipelineJob(meetingId, { attempt: 3, maxAttempts: 3 });
      await waitFor(() => !!gate.release);
      await service.delete(creator, meetingId);
      gate.release!('ZOMBIE SUMMARY');
      // Superseded, so not even its final failure is recorded.
      await expect(run).resolves.toBe('superseded');
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('analyzing');
      expect(JSON.stringify(row.aiOutputs)).not.toContain('ZOMBIE');
    });
  });

  describe('combined playback written by a fenced run', () => {
    it('a late superseded run cannot overwrite the bytes the manifest points to', async () => {
      const { service } = build();
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio' });
      const originalPath = `meetings/${meetingId}/original/a.webm`;
      const claim = (service as any).claimRun.bind(service);
      const old = await claim(meetingId, 1);
      const current = await claim(meetingId, 1); // supersedes the old run
      (mixMeetingPlayback as jest.Mock)
        .mockResolvedValueOnce(Buffer.from('NEW RUN BYTES'))
        .mockResolvedValueOnce(Buffer.from('LATE OLD RUN BYTES'));
      const meeting = await meetingRow(meetingId);
      const audio = [{ path: originalPath, mime: 'audio/webm', source: 'mic', startMs: 0 }];
      const scope = (service as any).runScope;
      await scope.run(current.fence, () => (service as any).prepareCombinedPlayback(meeting, audio));
      await expect(
        scope.run(old.fence, () => (service as any).prepareCombinedPlayback(meeting, audio)),
      ).rejects.toBeInstanceOf(StaleRunError);
      const row = await meetingRow(meetingId);
      const manifest = typeof row.audioManifest === 'string' ? JSON.parse(row.audioManifest) : row.audioManifest;
      expect(manifest.playbackPath).toBe(`meetings/${meetingId}/playback-${current.fence.runId}.m4a`);
      expect(files.get(manifest.playbackPath)?.toString()).toBe('NEW RUN BYTES');
      expect(files.has(`meetings/${meetingId}/playback-${old.fence.runId}.m4a`)).toBe(false);
      expect([...files.values()].some((b) => b.toString() === 'LATE OLD RUN BYTES')).toBe(false);
      expect(manifest.originalPath).toBe(originalPath); // originals untouched
      expect(files.get(originalPath)?.toString()).toBe('audio');
    });
  });

  describe('digital silence on a channel', () => {
    const MIC = { meanDb: -25.8, peakDb: -1.1 }; // the stalled LTC recording
    const SILENT = { meanDb: -91, peakDb: -91 };
    async function liveMeeting() {
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio', template: true, withAudio: false });
      const mic = `meetings/${meetingId}/chunks/mic-0.webm`;
      const system = `meetings/${meetingId}/chunks/system-0.webm`;
      files.set(mic, Buffer.from('MIC'));
      files.set(system, Buffer.from('SYSTEM'));
      await db
        .updateTable('meetings')
        .set({
          captureKind: 'live',
          audioManifest: sql`${JSON.stringify({
            chunks: [
              { path: mic, source: 'mic', sequence: 0, startMs: 0, durationMs: 30000, mime: 'audio/webm' },
              { path: system, source: 'system', sequence: 0, startMs: 0, durationMs: 30000, mime: 'audio/webm' },
            ],
          })}::text::jsonb`,
        })
        .where('id', '=', meetingId)
        .execute();
      return { meetingId, mic, system };
    }
    function withSignals(service: MeetingService, system: unknown) {
      (service as any).inspectSignal = jest.fn(async (b: Buffer) => (b.toString() === 'SYSTEM' ? system : MIC));
    }

    it('skips a digitally silent system channel: no provider call for it, the voice is transcribed, originals kept', async () => {
      const stt = sttDouble();
      const { service } = build({ stt });
      const { meetingId, system } = await liveMeeting();
      withSignals(service, SILENT);
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1);
      expect((stt.transcribeDiarized.mock.calls[0] as any[])[0].toString()).toBe('MIC');
      expect(files.get(system)?.toString()).toBe('SYSTEM');
      const ev = await sql<{ d: any }>`select detail as d from meeting_processing_events where meeting_id = ${meetingId} and event = 'audio_source_silent'`.execute(db);
      expect(ev.rows).toHaveLength(1);
      expect(ev.rows[0].d).toMatchObject({ channel: 'system', transcribed: false, originalsKept: true, peakDb: -91 });
      const tr = await db.selectFrom('meetingTranscripts').select('segments').where('meetingId', '=', meetingId).executeTakeFirstOrThrow();
      const segments = typeof tr.segments === 'string' ? JSON.parse(tr.segments) : tr.segments;
      expect(segments.every((seg: any) => seg.channel !== 'system')).toBe(true);
    });

    it('keeps a very quiet but real system voice, and an unmeasurable one', async () => {
      for (const signal of [{ meanDb: -55, peakDb: -38 }, null]) {
        const stt = sttDouble();
        const { service } = build({ stt });
        const { meetingId } = await liveMeeting();
        withSignals(service, signal);
        expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
        expect(stt.transcribeDiarized).toHaveBeenCalledTimes(2);
        expect(await count('meetingProcessingEvents', meetingId, (q) => q.where('event', '=', 'audio_source_silent'))).toBe(0);
      }
    });

    it('fails clearly when every source is digital silence, without calling the provider or inventing words', async () => {
      const stt = sttDouble();
      const { service } = build({ stt });
      const { meetingId, system } = await liveMeeting();
      (service as any).inspectSignal = jest.fn(async () => SILENT);
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('failed');
      expect(stt.transcribeDiarized).not.toHaveBeenCalled();
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('failed');
      expect(row.failureReason).toContain('Aucun son n’a été capté');
      expect(await count('meetingTranscripts', meetingId)).toBe(0);
      expect(files.get(system)?.toString()).toBe('SYSTEM');
    });
  });

  redisSuite('with the real BullMQ queue', () => {
    const queueName = `{meeting-queue-test-${randomUUID().slice(0, 8)}}`;
    let connection: { host: string; port: number };
    let queue: Queue;
    const workers: Worker[] = [];

    beforeAll(() => {
      const u = new URL(redisUrl!);
      connection = { host: u.hostname, port: Number(u.port || 6379) };
      queue = new Queue(queueName, { connection });
    });
    afterAll(async () => {
      // Release what the tests left hanging, let the workers settle, then
      // close every connection this suite opened (worker, queue).
      for (const release of hung.splice(0)) release('- libéré');
      await new Promise((r) => setTimeout(r, 300));
      await Promise.all(workers.map((w) => w.close(true).catch(() => undefined)));
      await queue?.obliterate({ force: true }).catch(() => undefined);
      await queue?.close();
      await queue?.disconnect().catch(() => undefined);
    });

    /** A worker wired like Nest wires MeetingPipelineProcessor (process +
     *  @OnWorkerEvent('completed' / 'failed')). `afterProcess` holds a job
     *  between the end of its run and its move to "completed". */
    function startWorker(
      service: MeetingService,
      afterProcess?: (meetingId: string) => Promise<void>,
    ) {
      const processor = new MeetingPipelineProcessor(service);
      const worker = new Worker(
        queueName,
        async (job) => {
          const result = await processor.process(job as any);
          if (afterProcess) await afterProcess(job.data.meetingId);
          return result;
        },
        {
          connection,
          lockDuration: 1500,
          stalledInterval: 500,
          maxStalledCount: 2,
        },
      );
      worker.on('completed', (job) => void processor.onCompleted(job as any));
      worker.on('failed', (job) => void processor.onFailed(job as any));
      workers.push(worker);
      return worker;
    }

    /** Earlier tests' workers would take these jobs with other doubles. */
    async function stopWorkers() {
      await Promise.all(workers.splice(0).map((w) => w.close(true).catch(() => undefined)));
    }

    const events = (meetingId: string, event: string) =>
      count('meetingProcessingEvents', meetingId, (q) => q.where('event', '=', event));
    const liveJobs = async (meetingId: string) =>
      (await queue.getJobs(['active', 'waiting', 'delayed', 'prioritized'])).filter(
        (j) => j?.data?.meetingId === meetingId, // a job removed mid-listing is undefined
      ).length;
    /** run_claimed details as stored: jsonb type and the request they name. */
    const claims = async (meetingId: string) =>
      (
        await sql<{ t: string; requestId: string | null; reason: string | null }>`
          select jsonb_typeof(detail) as t, detail->>'requestId' as "requestId", detail->>'reason' as reason
          from meeting_processing_events where meeting_id = ${meetingId} and event = 'run_claimed'
          order by created_at, id`.execute(db)
      ).rows;
    const latestKick = async (meetingId: string) =>
      (
        await sql<{ id: string; t: string }>`
          select id, jsonb_typeof(detail) as t from meeting_processing_events
          where meeting_id = ${meetingId} and event = 'transition' and actor_id is not null
          order by created_at desc, id desc limit 1`.execute(db)
      ).rows[0];
    const kickBy = async (meetingId: string, actorId: string | null, toStatus: string, extra: Record<string, unknown> = {}) =>
      db
        .insertInto('meetingProcessingEvents')
        .values({
          meetingId,
          event: 'transition',
          fromStatus: 'speakers_pending_review',
          toStatus,
          actorId,
          detail: sql`${JSON.stringify({ kicked: true, ...extra })}::text::jsonb`,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    /** The sweep reads the whole table: keep only these meetings in play. */
    const isolateSweep = async (keep: string[]) => {
      await sql`update meetings set deleted_at = now()
        where deleted_at is null and status in ('finalizing','normalizing_audio','batch_submitted','batch_processing','transcribed','analyzing','documents_generating','proposals_generating')
          and not (id = any(${keep}::uuid[]))`.execute(db);
    };
    const summaryCalls = (ai: ReturnType<typeof aiDouble>) =>
      ai.calls.filter((c) => (c.prompt ?? '').includes('structured markdown summary')).length;

    /** Pause point inside a run; `reached` once a run waits on it. */
    function gate() {
      const g: { reached: boolean; release: () => void; wait: () => Promise<void> } = {
        reached: false,
        release: () => undefined,
        wait: () =>
          new Promise<void>((resolve) => {
            g.reached = true;
            g.release = resolve;
          }),
      };
      return g;
    }

    async function expectAnalysedOnceAfterConfirmation(o: {
      meetingId: string;
      service: MeetingService;
      ai: ReturnType<typeof aiDouble>;
      stt: ReturnType<typeof sttDouble>;
      notifications: { transitions: Array<{ meetingId: string; to: string }> };
    }) {
      const { meetingId } = o;
      await waitFor(async () => (await meetingRow(meetingId)).status === 'awaiting_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      await new Promise((r) => setTimeout(r, 700)); // nothing else is queued
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('awaiting_review');
      expect(row.processingRunId).toBeNull();
      expect(o.stt.transcribeDiarized).toHaveBeenCalledTimes(1); // no extra STT call
      expect(summaryCalls(o.ai)).toBe(1); // one analysis
      expect(await count('meetingTranscripts', meetingId)).toBe(2); // v1 + confirmed v2
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      expect(await count('meetingActionProposals', meetingId)).toBe(2);
      expect(await events(meetingId, 'run_claimed')).toBe(2); // old run + continuation
      expect(await events(meetingId, 'continuation_enqueued')).toBe(1);
      // The continuation run names the person's request; details are objects.
      const kick = await latestKick(meetingId);
      expect(kick.t).toBe('object');
      const claimed = await claims(meetingId);
      expect(claimed.every((c) => c.t === 'object')).toBe(true);
      expect(claimed[claimed.length - 1].requestId).toBe(kick.id);
      expect(await liveJobs(meetingId)).toBe(0);
      expect(
        o.notifications.transitions.filter((t) => t.meetingId === meetingId && t.to === 'awaiting_review'),
      ).toHaveLength(1);
      // Asking again changes nothing: the request was served (bounded).
      expect(await o.service.continueRequestedRun(meetingId)).toBe(false);
    }

    it('a run cut by a process crash is picked up by another worker and finishes once', async () => {
      // First process: its provider call hangs in the analysis, then the
      // process "crashes" (worker force-closed while still alive).
      const { ai, gate } = aiWithLateSummary();
      const stt = sttDouble();
      const { service } = build({ ai, stt, queue });
      const refused = trackFencing(service);
      const meetingId = await addMeeting({ by: creator, status: 'uploaded', template: true });
      const first = startWorker(service);
      await service.process(creator, meetingId, {});
      await waitFor(() => !!gate.release); // the call is really in flight
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1);
      await first.close(true); // crash: the job keeps its lock until it expires

      // A second process starts; BullMQ hands it the stalled job.
      startWorker(service);
      await waitFor(async () => (await meetingRow(meetingId)).status === 'awaiting_review');
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1); // never re-transcribed
      expect(await count('meetingTranscripts', meetingId)).toBe(1);
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      expect(await count('meetingActionProposals', meetingId)).toBe(2);
      const status = await service.getStatus(creator, meetingId);
      expect(status.processing.state).toBe('idle');
      const events = await count('meetingProcessingEvents', meetingId);

      // The "crashed" process was still alive: its provider call returns now.
      gate.release!('ZOMBIE SUMMARY');
      await waitFor(() => refused.includes('StaleRunError'));
      await new Promise((r) => setTimeout(r, 300));
      const after = await meetingRow(meetingId);
      expect(after.status).toBe('awaiting_review');
      expect(JSON.stringify(after.aiOutputs)).not.toContain('ZOMBIE');
      expect(await count('meetingProcessingEvents', meetingId)).toBe(events);
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      expect(await count('meetingActionProposals', meetingId)).toBe(2);
    });

    it('speakers confirmed while the paused run is still finishing: the old run is superseded, the request runs once after it', async () => {
      await stopWorkers();
      const ai = aiDouble(defaultAi());
      const stt = sttDouble({ twoVoices: true });
      const { service, notifications } = build({ ai, stt, queue });
      const hold = gate();
      const finishRun = (service as any).finishRun.bind(service);
      // Hold the first run between its pause for review and its last write.
      jest
        .spyOn(service as any, 'finishRun')
        .mockImplementationOnce(async (...args: any[]) => {
          await hold.wait();
          return finishRun(...args);
        });
      const meetingId = await addMeeting({ by: creator, status: 'uploaded', template: true });
      startWorker(service);
      await service.process(creator, meetingId, {});
      await waitFor(() => hold.reached);
      expect((await meetingRow(meetingId)).status).toBe('speakers_pending_review');
      expect(await (await queue.getJob(pipelineJobId(meetingId)))?.getState()).toBe('active');

      // The person confirms while the old job is still active.
      await service.reviewSpeakers(creator, meetingId, { baseVersion: 1, confirm: true });
      const kicked = await meetingRow(meetingId);
      expect(kicked.status).toBe('analyzing');
      expect(kicked.processingRunId).toBeNull();
      expect(await events(meetingId, 'processing_waiting_previous_run')).toBe(1);
      expect(await liveJobs(meetingId)).toBe(1); // still only the old job

      hold.release(); // the old run's fence is gone: it exits superseded
      await expectAnalysedOnceAfterConfirmation({ meetingId, service, ai, stt, notifications });
      // The superseded run released nothing in the new run's name.
      const failed = await count('meetingProcessingEvents', meetingId, (q) =>
        q.where('event', '=', 'transition').where('toStatus', 'in', ['failed', 'partially_failed']),
      );
      expect(failed).toBe(0);
    });

    it('speakers confirmed after the paused run finished but before its job left BullMQ: still runs once', async () => {
      await stopWorkers();
      const ai = aiDouble(defaultAi());
      const stt = sttDouble({ twoVoices: true });
      const { service, notifications } = build({ ai, stt, queue });
      const hold = gate();
      let first = true;
      const meetingId = await addMeeting({ by: creator, status: 'uploaded', template: true });
      startWorker(service, async () => {
        if (!first) return;
        first = false;
        await hold.wait(); // run done, token released, job still "active"
      });
      await service.process(creator, meetingId, {});
      await waitFor(() => hold.reached);
      const paused = await meetingRow(meetingId);
      expect(paused.status).toBe('speakers_pending_review');
      expect(paused.processingRunId).toBeNull();
      expect(await (await queue.getJob(pipelineJobId(meetingId)))?.getState()).toBe('active');

      await service.reviewSpeakers(creator, meetingId, { baseVersion: 1, confirm: true });
      expect((await meetingRow(meetingId)).status).toBe('analyzing');
      expect(await liveJobs(meetingId)).toBe(1);

      hold.release();
      await expectAnalysedOnceAfterConfirmation({ meetingId, service, ai, stt, notifications });
    });

    it('a request that reaches the queue after the old job left it is queued by the request itself, once', async () => {
      await stopWorkers();
      const ai = aiDouble(defaultAi());
      const stt = sttDouble({ twoVoices: true });
      const { service, notifications } = build({ ai, stt, queue });
      const meetingId = await addMeeting({ by: creator, status: 'uploaded', template: true });
      startWorker(service);
      await service.process(creator, meetingId, {});
      await waitFor(async () => (await meetingRow(meetingId)).status === 'speakers_pending_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      await service.reviewSpeakers(creator, meetingId, { baseVersion: 1, confirm: true });
      await waitFor(async () => (await meetingRow(meetingId)).status === 'awaiting_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      await new Promise((r) => setTimeout(r, 500));
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1);
      expect(summaryCalls(ai)).toBe(1);
      expect(await events(meetingId, 'run_claimed')).toBe(2);
      expect(await events(meetingId, 'continuation_enqueued')).toBe(0);
      expect(await events(meetingId, 'processing_waiting_previous_run')).toBe(0);
      expect(notifications.transitions.filter((t) => t.meetingId === meetingId && t.to === 'awaiting_review')).toHaveLength(1);
    });

    it('never continues paused reviews, system transitions, recordings, deleted, deactivated or unconsented cases; a request stays pending until a run claims it', async () => {
      await stopWorkers();
      const { service } = build({ queue });

      // Waiting on a human: never picked up.
      const paused = await addMeeting({ by: creator, status: 'speakers_pending_review', withTranscript: true });
      expect(await service.continueRequestedRun(paused)).toBe(false);
      // A recording in progress: never picked up.
      const recording = await addMeeting({ by: creator, status: 'recording' });
      await kickBy(recording, creator.id, 'recording');
      expect(await service.continueRequestedRun(recording)).toBe(false);
      // A processing status without a person's request (system transition).
      const system = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true });
      expect(await service.continueRequestedRun(system)).toBe(false);
      // A request by someone outside the company is not a request.
      const outsider = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true });
      await kickBy(outsider, foreign.id, 'analyzing');
      expect(await service.continueRequestedRun(outsider)).toBe(false);
      // A request by an account deactivated since then is not continued.
      const leaver = await addUser(ws1, 'member');
      await db.updateTable('users').set({ deactivatedAt: new Date() }).where('id', '=', leaver.id).execute();
      const byLeaver = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true });
      await kickBy(byLeaver, leaver.id, 'analyzing');
      expect(await service.continueRequestedRun(byLeaver)).toBe(false);
      // Deleted, or consent missing.
      const deleted = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, deleted: true });
      await kickBy(deleted, creator.id, 'analyzing');
      expect(await service.continueRequestedRun(deleted)).toBe(false);
      const unconsented = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, consent: false });
      await kickBy(unconsented, creator.id, 'analyzing');
      expect(await service.continueRequestedRun(unconsented)).toBe(false);
      // A run still holds the token: not orphaned.
      const running = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true });
      await kickBy(running, creator.id, 'analyzing');
      await db.updateTable('meetings').set({ processingRunId: randomUUID() }).where('id', '=', running).execute();
      expect(await service.continueRequestedRun(running)).toBe(false);

      // A real, unserved request: queued exactly once even when asked twice
      // at the same time (job event + another instance's sweep).
      const waiting = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true });
      await kickBy(waiting, creator.id, 'analyzing');
      const request = await kickBy(waiting, creator.id, 'analyzing');
      await Promise.all([
        service.continueRequestedRun(waiting),
        service.continueRequestedRun(waiting),
      ]);
      expect(await liveJobs(waiting)).toBe(1); // one job, whatever the callers
      // Queueing consumes nothing: a job lost before any run claimed the
      // request is queued again.
      await (await queue.getJob(pipelineJobId(waiting)))?.remove();
      expect(await service.continueRequestedRun(waiting)).toBe(true);
      expect(await liveJobs(waiting)).toBe(1);
      await (await queue.getJob(pipelineJobId(waiting)))?.remove();
      // Claimed by a run naming it: served, never queued again.
      await db
        .insertInto('meetingProcessingEvents')
        .values({
          meetingId: waiting,
          event: 'run_claimed',
          detail: sql`${JSON.stringify({ runId: randomUUID(), requestId: request.id })}::text::jsonb`,
        })
        .execute();
      expect(await service.continueRequestedRun(waiting)).toBe(false);
      for (const id of [paused, recording, system, outsider, byLeaver, deleted, unconsented, running]) {
        expect(await liveJobs(id)).toBe(0);
      }
    });

    it('the recovery sweep queues an unclaimed request, again after a lost job, and marks it interrupted only once served', async () => {
      await stopWorkers();
      const { service } = build({ queue });
      const meetingId = await addMeeting({
        by: creator,
        status: 'analyzing',
        withTranscript: true,
        lastEventAgoMs: 60 * 60 * 1000,
      });
      await isolateSweep([meetingId]);
      await db
        .updateTable('meetingProcessingEvents')
        .set({ actorId: creator.id, detail: sql`'{"kicked":true}'::jsonb` })
        .where('meetingId', '=', meetingId)
        .execute();
      const request = await latestKick(meetingId);
      for (let round = 0; round < 2; round++) {
        expect(await service.markStalledProcessing()).not.toContain(meetingId);
        expect((await meetingRow(meetingId)).status).toBe('analyzing');
        expect(await liveJobs(meetingId)).toBe(1);
        await (await queue.getJob(pipelineJobId(meetingId)))?.remove(); // lost
      }
      // A run claimed it (and was then lost): served — the stale run is now
      // marked interrupted as before.
      await db
        .insertInto('meetingProcessingEvents')
        .values({
          meetingId,
          event: 'run_claimed',
          detail: sql`${JSON.stringify({ runId: randomUUID(), requestId: request.id })}::text::jsonb`,
          createdAt: new Date(Date.now() - 50 * 60 * 1000),
        })
        .execute();
      await db
        .updateTable('meetingProcessingEvents')
        .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })
        .where('meetingId', '=', meetingId)
        .where('event', '!=', 'run_claimed')
        .execute();
      expect(await service.markStalledProcessing()).toContain(meetingId);
      expect((await meetingRow(meetingId)).failureReason).toBe(STALE_FAILURE_MESSAGE);
    });

    it('a failed queue add never consumes the request: the next sweep queues it and it is analysed once', async () => {
      await stopWorkers();
      const ai = aiDouble(defaultAi());
      const stt = sttDouble({ twoVoices: true });
      const { service } = build({ ai, stt, queue });
      const meetingId = await addMeeting({ by: creator, status: 'uploaded', template: true });
      startWorker(service);
      await service.process(creator, meetingId, {});
      await waitFor(async () => (await meetingRow(meetingId)).status === 'speakers_pending_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      const add = jest.spyOn(queue, 'add').mockRejectedValueOnce(new Error('Redis unavailable'));
      await service.reviewSpeakers(creator, meetingId, { baseVersion: 1, confirm: true });
      add.mockRestore();
      expect((await meetingRow(meetingId)).status).toBe('analyzing');
      expect(await liveJobs(meetingId)).toBe(0);
      expect(await events(meetingId, 'processing_enqueue_failed')).toBe(1);
      await isolateSweep([meetingId]);
      await service.markStalledProcessing();
      await waitFor(async () => (await meetingRow(meetingId)).status === 'awaiting_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      await new Promise((r) => setTimeout(r, 500));
      expect(stt.transcribeDiarized).toHaveBeenCalledTimes(1);
      expect(summaryCalls(ai)).toBe(1);
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      const claimed = await claims(meetingId);
      expect(claimed).toHaveLength(2);
      expect(claimed[1].requestId).toBe((await latestKick(meetingId)).id);
    });

    it('a request committed without its job (crash after commit) is queued by the sweep and analysed once', async () => {
      await stopWorkers();
      const ai = aiDouble(defaultAi());
      const stt = sttDouble();
      const { service } = build({ ai, stt, queue });
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      const request = await kickBy(meetingId, creator.id, 'analyzing');
      await isolateSweep([meetingId]);
      startWorker(service);
      expect(await service.markStalledProcessing()).not.toContain(meetingId);
      await waitFor(async () => (await meetingRow(meetingId)).status === 'awaiting_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      await new Promise((r) => setTimeout(r, 500));
      expect(stt.transcribeDiarized).not.toHaveBeenCalled();
      expect(summaryCalls(ai)).toBe(1);
      expect(await count('meetingDocuments', meetingId)).toBe(1);
      expect(await claims(meetingId)).toEqual([{ t: 'object', requestId: request.id, reason: 'kick' }]);
      expect(await service.continueRequestedRun(meetingId)).toBe(false);
    });

    it('identity is exact: an unrelated or older legacy claim in the same millisecond does not serve a request', async () => {
      await stopWorkers();
      const { service } = build({ queue });
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true });
      const request = await kickBy(meetingId, creator.id, 'analyzing');
      // Microsecond timestamps inside ONE millisecond: a JavaScript Date
      // would see them equal.
      await sql`update meeting_processing_events set created_at = '2026-10-14 10:00:00.000500+00' where id = ${request.id}`.execute(db);
      const legacy = { runId: randomUUID() }; // written before requestIds existed
      await sql`insert into meeting_processing_events (meeting_id, event, detail, created_at)
        values (${meetingId}, 'run_claimed', ${JSON.stringify(legacy)}::text::jsonb, '2026-10-14 10:00:00.000200+00')`.execute(db);
      await sql`insert into meeting_processing_events (meeting_id, event, detail, created_at)
        values (${meetingId}, 'run_claimed', ${JSON.stringify({ runId: randomUUID(), requestId: randomUUID() })}::text::jsonb, now())`.execute(db);
      // Legacy string-encoded detail (the old bug) is still read as an object.
      await sql`insert into meeting_processing_events (meeting_id, event, detail, created_at)
        values (${meetingId}, 'run_claimed', to_jsonb(${JSON.stringify({ runId: randomUUID(), requestId: randomUUID() })}::text), now())`.execute(db);
      expect(await service.continueRequestedRun(meetingId)).toBe(true);
      await (await queue.getJob(pipelineJobId(meetingId)))?.remove();
      // A legacy claim strictly after the request (by database time) serves it.
      await sql`insert into meeting_processing_events (meeting_id, event, detail, created_at)
        values (${meetingId}, 'run_claimed', to_jsonb(${JSON.stringify(legacy)}::text), '2026-10-14 10:00:00.000900+00')`.execute(db);
      expect(await service.continueRequestedRun(meetingId)).toBe(false);
    });

    it('a waiting job with an old reason serves the latest reanalysis request with its intent', async () => {
      await stopWorkers();
      let reports = 0;
      const ai = aiDouble(
        defaultAi(() =>
          JSON.stringify({
            sections: {
              summary: ++reports === 1 ? 'Première analyse Atlas.' : 'Deuxième analyse Atlas.',
              decisions: '- Lancer la phase deux.',
              actions: '- [Marie] Plan de recrutement',
              next_steps: '- Valider jeudi.',
            },
          }),
        ),
      );
      const stt = sttDouble();
      const { service } = build({ ai, stt, queue });
      const meetingId = await addMeeting({ by: creator, status: 'analyzing', withTranscript: true, template: true });
      expect(await service.runPipelineJob(meetingId, { attempt: 1, maxAttempts: 3 })).toBe('done');
      expect((await db.selectFrom('meetingDocuments').select('contentMarkdown').where('meetingId', '=', meetingId).executeTakeFirstOrThrow()).contentMarkdown).toContain('Première analyse');
      // An older job for this meeting is still waiting, carrying reason "kick".
      await queue.add(QueueJob.MEETING_PIPELINE, { meetingId, reason: 'kick' }, { jobId: pipelineJobId(meetingId), removeOnComplete: true, removeOnFail: true });
      // A person renames a speaker after analysis: a forced reanalysis.
      await service.reviewSpeakers(creator, meetingId, { baseVersion: 1, renames: { 'Speaker 1': 'Marie' }, confirm: true });
      expect((await meetingRow(meetingId)).status).toBe('analyzing');
      expect(await liveJobs(meetingId)).toBe(1); // still the old job
      const request = await latestKick(meetingId);
      startWorker(service); // release
      await waitFor(async () => (await meetingRow(meetingId)).status === 'awaiting_review');
      await waitFor(async () => (await liveJobs(meetingId)) === 0);
      await new Promise((r) => setTimeout(r, 500));
      expect(stt.transcribeDiarized).not.toHaveBeenCalled();
      expect(reports).toBe(2); // one fresh analysis
      const docs = await db.selectFrom('meetingDocuments').select('contentMarkdown').where('meetingId', '=', meetingId).execute();
      expect(docs).toHaveLength(1); // the draft is replaced, not duplicated
      expect(docs[0].contentMarkdown).toContain('Deuxième analyse');
      const last = (await claims(meetingId)).pop()!;
      expect(last).toEqual({ t: 'object', requestId: request.id, reason: 'reanalysis' });
      const done = await sql<{ r: string | null }>`select detail->>'reanalysis' as r from meeting_processing_events
        where meeting_id = ${meetingId} and event = 'transition' and to_status = 'awaiting_review' order by created_at desc limit 1`.execute(db);
      expect(done.rows[0].r).toBe('true');
    });

    it('a same-status request between the sweep snapshot and its update wins: the fresh run is not failed', async () => {
      await stopWorkers();
      const { service } = build({ queue });
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio', lastEventAgoMs: 60 * 60 * 1000 });
      await db.updateTable('meetings').set({ processingRunId: randomUUID() }).where('id', '=', meetingId).execute(); // a crashed run
      await isolateSweep([meetingId]);
      const state = (service as any).pipelineJobState.bind(service);
      jest.spyOn(service as any, 'pipelineJobState').mockImplementationOnce(async () => {
        // After the snapshot, before the compare-and-set: the person retries
        // into the SAME status.
        await (service as any).kickPipeline(meetingId, 'normalizing_audio', 'normalizing_audio', { actorId: creator.id, retry: true });
        return null; // what the sweep saw at its snapshot
      });
      expect(await service.markStalledProcessing()).not.toContain(meetingId);
      const row = await meetingRow(meetingId);
      expect(row.status).toBe('normalizing_audio');
      expect(row.failureReason).toBeNull();
      expect(await liveJobs(meetingId)).toBe(1); // the fresh request's job is intact
      expect(await state(meetingId)).toBe('waiting');
      await (await queue.getJob(pipelineJobId(meetingId)))?.remove();
    });

    it('a Redis lookup failure is never proof that no run is alive', async () => {
      await stopWorkers();
      const { service } = build({ queue });
      const meetingId = await addMeeting({ by: creator, status: 'normalizing_audio', lastEventAgoMs: 60 * 60 * 1000 });
      await isolateSweep([meetingId]);
      const getJob = jest.spyOn(queue, 'getJob').mockRejectedValue(new Error('Redis timeout'));
      expect(await service.markStalledProcessing()).not.toContain(meetingId);
      expect((await meetingRow(meetingId)).status).toBe('normalizing_audio');
      expect((await service.getStatus(creator, meetingId)).processing.state).toBe('queued');
      await expect(service.retryProcessing(creator, meetingId)).rejects.toBeInstanceOf(ConflictException);
      getJob.mockRestore();
      expect(await service.markStalledProcessing()).toContain(meetingId);
    });

    it('never queues a second job for a run that is still alive', async () => {
      const ai = aiDouble((args) =>
        (args.prompt ?? '').includes('structured markdown summary')
          ? hangForever()
          : defaultAi()(args),
      );
      const { service } = build({ ai, queue });
      const meetingId = await addMeeting({ by: creator, status: 'awaiting_review', withTranscript: true, template: true });
      startWorker(service);
      await service.process(creator, meetingId, {});
      await waitFor(async () => (await service.getStatus(creator, meetingId)).processing.state === 'running');
      expect(await service.process(creator, meetingId, {})).toMatchObject({ alreadyRunning: true });
      await expect(service.retryProcessing(creator, meetingId)).rejects.toBeInstanceOf(ConflictException);
      const jobs = await queue.getJobs(['active', 'waiting', 'delayed']);
      expect(jobs.filter((j) => j?.data?.meetingId === meetingId)).toHaveLength(1);
      // Deleting the meeting removes it from every path; the hung job,
      // once its provider answers, is refused and the job simply ends.
      await service.delete(creator, meetingId);
      await expect(service.getStatus(creator, meetingId)).rejects.toBeInstanceOf(NotFoundException);
      for (const release of hung.splice(0)) release('- libéré');
      await waitFor(async () => (await queue.getJobs(['active', 'waiting', 'delayed'])).length === 0);
    });
  });
});
