import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { mixMeetingPlayback } from './meeting-audio.util';
import { detectAudioContainer } from './meeting-media.util';

// Unused document/provider constructors are injected below. Keep their ESM
// editor/SDK dependencies outside this audio + PostgreSQL integration test.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));
// Actual encoding is separately checked with FFmpeg and known frequencies.
jest.mock('./meeting-audio.util', () => ({
  ...jest.requireActual('./meeting-audio.util'),
  mixMeetingPlayback: jest.fn(async () => Buffer.from('combined playback')),
  // No ffmpeg in unit runs: "cannot measure" keeps the existing path.
  inspectAudioSignal: jest.fn(async () => null),
}));
// The test bytes are short labels ('mic', 'remote'…) that the fake STT echoes
// back. Container sniffing has its own spec (meeting-media.util.spec.ts); here
// a label counts as WebM, and one test below restores the real check.
jest.mock('./meeting-media.util', () => {
  const actual = jest.requireActual('./meeting-media.util');
  return {
    ...actual,
    detectAudioContainer: jest.fn(
      (buf: Buffer) =>
        actual.detectAudioContainer(buf) ??
        (buf?.length ? { mime: 'audio/webm', ext: 'webm' } : null),
    ),
  };
});

// This integration spec runs against a disposable local PostgreSQL container.
const suite = process.env.MEETING_TEST_DATABASE_URL ? describe : describe.skip;
suite('meeting audio storage with real concurrent PostgreSQL writes', () => {
  let db: Kysely<any>;
  let service: MeetingService;
  let files: Map<string, Buffer>;
  let storage: any;
  let meetingId: string;
  // An Owner/Admin of the meeting's workspace may write to it (LTC-03).
  let actor: { id: string; role: string; workspaceId: string };
  const meta = (source: string, durationMs = 3000) => ({
    source,
    sequence: 0,
    startMs: 0,
    durationMs,
    mime: 'audio/webm',
  });

  beforeAll(async () => {
    db = new Kysely({
      dialect: new PostgresJSDialect({
        postgres: postgres(process.env.MEETING_TEST_DATABASE_URL, { max: 5 }),
      }),
      plugins: [new CamelCasePlugin()],
    });
    await sql`CREATE TABLE meetings (id uuid PRIMARY KEY, status text, deleted_at timestamptz,
      audio_storage_prefix text, audio_manifest jsonb, duration_ms integer, transcript text,
      workspace_id uuid, user_id uuid, capture_kind text)`.execute(db);
    await sql`CREATE TABLE meeting_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid,
      source text, sequence integer, start_ms integer, duration_ms integer, text text)`.execute(
      db,
    );
    await sql`CREATE TABLE meeting_transcripts (meeting_id uuid, version integer, kind text, status text,
      provider text, language text, segments jsonb, speakers jsonb, is_provisional boolean,
      processing_config jsonb)`.execute(
      db,
    );
  });
  afterAll(async () => {
    await db?.destroy();
  });
  beforeEach(async () => {
    meetingId = randomUUID();
    files = new Map();
    // Strict Private: only the meeting's creator records into it.
    actor = { id: randomUUID(), role: 'member', workspaceId: randomUUID() };
    await db
      .insertInto('meetings')
      .values({
        id: meetingId,
        status: 'recording',
        audioManifest: { retained: true },
        durationMs: 0,
        captureKind: 'live',
        workspaceId: actor.workspaceId,
        userId: actor.id,
      })
      .execute();
    storage = {
      upload: jest.fn(async (path: string, audio: Buffer) => {
        await new Promise((r) => setTimeout(r, 5));
        files.set(path, audio);
      }),
      read: jest.fn(async (path: string) => files.get(path)),
      exists: jest.fn(async (path: string) => files.has(path)),
      delete: jest.fn(async (path: string) => {
        files.delete(path);
      }),
    };
    const stt = {
      transcribeDiarized: jest.fn(async (audio: Buffer) => ({
        text: audio.toString(),
        language: 'en',
        segments: [
          {
            text: audio.toString(),
            startMs: audio.toString() === 'remote' ? 1200 : 0,
            endMs: 1800,
            speakerId: 'speaker_1',
          },
        ],
      })),
    };
    service = new MeetingService(
      db as any,
      storage,
      stt as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { onTransition: async () => undefined, onPublished: async () => undefined } as any,
    );
    jest
      .spyOn(service as any, 'getWorkspaceName')
      .mockResolvedValue('La Tête Chercheuse');
  });
  const meeting = () =>
    db
      .selectFrom('meetings')
      .selectAll()
      .where('id', '=', meetingId)
      .executeTakeFirstOrThrow();

  it('an Admin of the same company cannot record into a colleague meeting, and nothing is stored', async () => {
    const admin = { id: randomUUID(), role: 'admin', workspaceId: actor.workspaceId };
    await expect(
      service.ingestChunk(admin, meetingId, Buffer.from('mic'), meta('mic')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(files.size).toBe(0);
    expect((await meeting()).audioManifest.chunks ?? []).toHaveLength(0);
  });

  it('retains distinct microphone and system bytes and both manifest entries when uploaded together', async () => {
    await Promise.all([
      service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(actor, meetingId, Buffer.from('remote'), meta('system')),
    ]);
    const row = await meeting();
    expect(row.audioManifest.retained).toBe(true);
    expect(row.audioManifest.chunks).toHaveLength(2);
    const bySource = Object.fromEntries(
      row.audioManifest.chunks.map((c: any) => [
        c.source,
        files.get(c.path)?.toString(),
      ]),
    );
    expect(bySource).toEqual({ mic: 'mic', system: 'remote' });
    expect(files.size).toBe(2);
    expect(
      await db
        .selectFrom('meetingSegments')
        .selectAll()
        .where('meetingId', '=', meetingId)
        .execute(),
    ).toHaveLength(2);
  });
  it('retries replace only the matching channel/sequence without duplicate transcript inputs', async () => {
    await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic'));
    await Promise.all([
      service.ingestChunk(actor, meetingId, Buffer.from('replacement'), {
        ...meta('mic'),
        replace: true,
      }),
      service.ingestChunk(actor, meetingId, Buffer.from('remote'), meta('system')),
    ]);
    expect((await meeting()).audioManifest.chunks).toHaveLength(2);
    expect(files.size).toBe(2);
    const chunks = (await meeting()).audioManifest.chunks;
    expect(
      files.get(chunks.find((c: any) => c.source === 'mic').path)?.toString(),
    ).toBe('replacement');
  });
  it('a re-send of the same bytes is a no-op, also after stop; other bytes need replace', async () => {
    const first = await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic'));
    expect(first).toMatchObject({ duplicate: false, replaced: false, nextSequence: 1 });
    const again = await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic'));
    expect(again).toMatchObject({ duplicate: true, segmentId: first.segmentId, sha256: first.sha256 });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('other'), meta('mic')),
    ).rejects.toMatchObject({ status: 409 });
    expect(files.size).toBe(1);
    await db.updateTable('meetings').set({ status: 'finalizing' }).where('id', '=', meetingId).execute();
    // The response of the last chunk was lost while the recorder stopped.
    expect(
      await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic')),
    ).toMatchObject({ duplicate: true });
  });

  it('progressive capture: timeslice parts are read back as one file per take, in order', async () => {
    // Uploaded out of order and concurrently with the other source.
    const part = (source: string, sequence: number, bytes: string, startMs: number) =>
      service.ingestChunk(actor, meetingId, Buffer.from(bytes), {
        source,
        sequence,
        startMs,
        durationMs: 10_000,
        mime: 'audio/webm;codecs=opus',
        continuation: sequence > 0,
      });
    await part('mic', 0, 'HDR-a', 0);
    await Promise.all([part('mic', 2, '-c', 20_000), part('mic', 1, '-b', 10_000), part('system', 0, 'SYS', 0)]);
    const sources = await (service as any).resolveAudioSources(await meeting());
    expect(sources.map((s: any) => [s.source, s.parts?.length ?? 1, s.startMs, s.durationMs])).toEqual([
      ['mic', 3, 0, 30_000],
      ['system', 1, 0, 10_000],
    ]);
    const result = await (service as any).transcribeMeeting(meetingId, sources);
    const sent = (service as any).stt.transcribeDiarized.mock.calls.map((c: any) => c[0].toString());
    expect(sent.sort()).toEqual(['HDR-a-b-c', 'SYS']);
    expect(result.segments).toHaveLength(2);
    expect((await meeting()).durationMs).toBe(30_000);
  });

  it('a single take of several parts becomes the playback file as recorded, no re-encoding', async () => {
    for (const [sequence, bytes] of [[0, 'HDR'], [1, '+1'], [2, '+2']] as const) {
      await service.ingestChunk(actor, meetingId, Buffer.from(bytes), {
        ...meta('mic', 5000),
        sequence,
        startMs: sequence * 5000,
        continuation: sequence > 0,
      });
    }
    const row = await meeting();
    const sources = await (service as any).resolveAudioSources(row);
    expect((service as any).needsPlayback(row, sources)).toBe(true);
    (mixMeetingPlayback as jest.Mock).mockClear();
    await (service as any).prepareCombinedPlayback(row, sources);
    expect(mixMeetingPlayback).not.toHaveBeenCalled();
    const manifest = (await meeting()).audioManifest;
    expect(files.get(manifest.playbackPath)?.toString()).toBe('HDR+1+2');
    expect(await (service as any).resolveAudioFile(actor, meetingId, 'original')).toEqual({
      filePath: manifest.playbackPath,
      mime: 'audio/webm',
    });
  });

  it('refuses a headerless chunk 0, and timing past the duration limit', async () => {
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('x'), { ...meta('mic'), continuation: true }),
    ).rejects.toThrow('en-tête');
    const before = process.env.MEETING_CAPTURE_MAX_MINUTES;
    process.env.MEETING_CAPTURE_MAX_MINUTES = '10';
    try {
      await expect(
        service.ingestChunk(actor, meetingId, Buffer.from('x'), { ...meta('mic', 10_000), startMs: 12 * 60_000 + 1 }),
      ).rejects.toMatchObject({ status: 422 });
      expect(
        await service.ingestChunk(actor, meetingId, Buffer.from('x'), { ...meta('mic', 10_000), startMs: 9 * 60_000 }),
      ).toMatchObject({ duplicate: false });
    } finally {
      if (before === undefined) delete process.env.MEETING_CAPTURE_MAX_MINUTES;
      else process.env.MEETING_CAPTURE_MAX_MINUTES = before;
    }
  });

  it('sniffs a header part, and a continuation part inherits the container of the part it continues', async () => {
    const actual = jest.requireActual('./meeting-media.util');
    const detect = detectAudioContainer as jest.Mock;
    // A header part that is not audio is refused (the real sniffing).
    detect.mockImplementationOnce(actual.detectAudioContainer);
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('<html>'), meta('mic')),
    ).rejects.toThrow('Unsupported audio format');

    // A continuation with no header part before it is refused.
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('tail'), {
        ...meta('system'),
        sequence: 1,
        continuation: true,
      }),
    ).rejects.toThrow('aucun morceau avec en-tête');

    // A real WebM header part, then headerless continuation bytes: the
    // continuation is not sniffed and takes the header part's type.
    const ebml = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]);
    detect.mockImplementation(actual.detectAudioContainer);
    try {
      await service.ingestChunk(actor, meetingId, ebml, meta('mic'));
      const next = await service.ingestChunk(actor, meetingId, Buffer.from([0x00, 0x01, 0x02]), {
        ...meta('mic'),
        sequence: 1,
        startMs: 3000,
        continuation: true,
      });
      expect(next).toMatchObject({ duplicate: false });
    } finally {
      detect.mockImplementation(
        (buf: Buffer) =>
          actual.detectAudioContainer(buf) ??
          (buf?.length ? { mime: 'audio/webm', ext: 'webm' } : null),
      );
    }
    const chunks = (await meeting()).audioManifest.chunks;
    const continued = chunks.find((c: any) => c.sequence === 1);
    expect(continued).toMatchObject({ continuation: true, mime: 'audio/webm' });
    expect(continued.path).toMatch(/\.webm$/);
  });

  it('stop refuses while sequences are missing and changes nothing', async () => {
    await service.ingestChunk(actor, meetingId, Buffer.from('a'), meta('mic'));
    await service.ingestChunk(actor, meetingId, Buffer.from('c'), { ...meta('mic'), sequence: 2, continuation: true });
    await expect(service.stop(actor, meetingId)).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'capture_incomplete', missing: { mic: [1] } }),
    });
    await service.ingestChunk(actor, meetingId, Buffer.from('b'), { ...meta('mic'), sequence: 1, continuation: true });
    await expect(
      service.stop(actor, meetingId, { expectedLastSequence: { mic: 3 } }),
    ).rejects.toMatchObject({ response: expect.objectContaining({ missing: { mic: [3] } }) });
    expect((await meeting()).status).toBe('recording');
    const state = await service.getCaptureState(actor, meetingId);
    expect(state.sources.mic).toMatchObject({ count: 3, nextSequence: 3, missingSequences: [] });
    expect(state.recording).toBe(true);
  });

  it('takes the longer channel duration without shrinking it on a later short upload', async () => {
    await service.ingestChunk(actor, meetingId,
      Buffer.from('remote'),
      meta('system', 7000),
    );
    await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic', 3000));
    expect((await meeting()).durationMs).toBe(7000);
  });
  it('preserves the other channel if a storage write fails', async () => {
    await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic'));
    storage.upload.mockRejectedValueOnce(new Error('upload failed'));
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('remote'), meta('system')),
    ).rejects.toThrow('upload failed');
    expect((await meeting()).audioManifest.chunks).toHaveLength(1);
    expect(files.size).toBe(1);
  });
  it('rejects closed recordings and invalid source/timing before persisting files', async () => {
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('x'), meta('../system')),
    ).rejects.toThrow('Invalid audio');
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('x'), meta('mic', -1)),
    ).rejects.toThrow('Invalid audio');
    await db
      .updateTable('meetings')
      .set({ status: 'completed' })
      .where('id', '=', meetingId)
      .execute();
    await expect(
      service.ingestChunk(actor, meetingId, Buffer.from('x'), meta('mic')),
    ).rejects.toThrow('not recording');
    expect(files.size).toBe(0);
  });
  it('transcribes both channels into interleaved distinct speaker turns', async () => {
    await Promise.all([
      service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(actor, meetingId, Buffer.from('remote'), meta('system')),
    ]);
    const sources = await (service as any).resolveAudioSources(await meeting());
    const result = await (service as any).transcribeMeeting(meetingId, sources);
    expect(
      result.segments.map((s: any) => [s.channel, s.speaker, s.text]),
    ).toEqual([
      ['mic', 'Speaker 1', 'mic'],
      ['system', 'Speaker 2', 'remote'],
    ]);
    expect(result.text).toContain('Speaker 1: mic');
    expect(result.text).toContain('Speaker 2: remote');
    expect((await meeting()).durationMs).toBe(3000);
  });

  it('keeps one copy of a sentence the microphone also heard from the speakers', async () => {
    const sentence = "Ah oui, c'est ça, dans tous les onglets.";
    (service as any).stt.transcribeDiarized.mockImplementation(async (audio: Buffer) => {
      const fromMic = audio.toString() === 'mic';
      return {
        text: sentence,
        language: 'fr',
        segments: [
          { text: sentence, startMs: fromMic ? 50 : 0, endMs: 1800, speakerId: 'speaker_1' },
          ...(fromMic ? [{ text: 'Je note.', startMs: 2500, endMs: 2900, speakerId: 'speaker_2' }] : []),
        ],
      };
    });
    await Promise.all([
      service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(actor, meetingId, Buffer.from('remote'), meta('system')),
    ]);
    const sources = await (service as any).resolveAudioSources(await meeting());
    const result = await (service as any).transcribeMeeting(meetingId, sources);
    expect(result.segments.map((s: any) => [s.channel, s.text])).toEqual([
      ['system', sentence],
      ['mic', 'Je note.'],
    ]);
    expect(result.text.split(sentence).length - 1).toBe(1);
  });

  it('persists combined playback as an object while retaining both inputs with the production Postgres.js driver', async () => {
    await Promise.all([
      service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(actor, meetingId, Buffer.from('remote'), meta('system')),
    ]);
    const row = await meeting();
    const sources = await (service as any).resolveAudioSources(row);
    await (service as any).prepareCombinedPlayback(row, sources);
    const manifest = (await meeting()).audioManifest;
    expect(typeof manifest).toBe('object');
    expect(Array.isArray(manifest)).toBe(false);
    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.retained).toBe(true);
    expect(files.get(manifest.playbackPath)?.toString()).toBe(
      'combined playback',
    );
    expect(
      await (service as any).resolveAudioFile(actor, meetingId, 'original'),
    ).toEqual({ filePath: manifest.playbackPath, mime: 'audio/mp4' });
  });

  it('retains three acoustic voices and repeated remote identity on the shared timeline', async () => {
    await Promise.all([
      service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic', 9000)),
      service.ingestChunk(actor, meetingId,
        Buffer.from('remote'),
        meta('system', 9000),
      ),
    ]);
    (service as any).stt.transcribeDiarized.mockImplementation(
      async (audio: Buffer) => ({
        text: '',
        language: 'fr',
        segments:
          audio.toString() === 'mic'
            ? [{ text: 'Alice parle.', startMs: 0, endMs: 800, speakerId: 'a' }]
            : [
                {
                  text: 'Julie parle.',
                  startMs: 1200,
                  endMs: 2000,
                  speakerId: 'a',
                },
                {
                  text: 'Paul répond.',
                  startMs: 3000,
                  endMs: 4000,
                  speakerId: 'b',
                },
                {
                  text: 'Julie revient.',
                  startMs: 7000,
                  endMs: 8000,
                  speakerId: 'a',
                },
              ],
      }),
    );
    const result = await (service as any).transcribeMeeting(
      meetingId,
      await (service as any).resolveAudioSources(await meeting()),
    );
    expect(result.segments.map((s: any) => s.speaker)).toEqual([
      'Speaker 1',
      'Speaker 2',
      'Speaker 3',
      'Speaker 2',
    ]);
    expect(
      result.segments.every(
        (s: any) => s.attribution === 'acoustic' && s.rawText === s.text,
      ),
    ).toBe(true);
  });

  it('stores the entire long transcript beyond the analysis prompt limit', async () => {
    const speech = 'détail important '.repeat(3000) + 'FIN DU TRANSCRIPT';
    await service.ingestChunk(actor, meetingId,
      Buffer.from(speech),
      meta('mic', 120000),
    );
    await (service as any).transcribeMeeting(
      meetingId,
      await (service as any).resolveAudioSources(await meeting()),
    );
    expect((await meeting()).transcript).toBe('Speaker 1: ' + speech);
  });

  it('transcribes multiple files of the same channel together to keep voice ids stable', async () => {
    await service.ingestChunk(actor, meetingId,
      Buffer.from('part one'),
      meta('system', 3000),
    );
    await service.ingestChunk(actor, meetingId, Buffer.from('part two'), {
      ...meta('system', 3000),
      sequence: 1,
      startMs: 6000,
    });
    (service as any).stt.transcribeDiarized.mockResolvedValue({
      text: 'One. Two.',
      language: 'en',
      segments: [
        { text: 'One.', startMs: 0, endMs: 1000, speakerId: 'voice' },
        { text: 'Two.', startMs: 6000, endMs: 7000, speakerId: 'voice' },
      ],
    });
    const result = await (service as any).transcribeMeeting(
      meetingId,
      await (service as any).resolveAudioSources(await meeting()),
    );
    expect((service as any).stt.transcribeDiarized).toHaveBeenCalledTimes(1);
    expect(mixMeetingPlayback).toHaveBeenCalledWith(
      expect.arrayContaining([
        { audio: Buffer.from('part one'), startMs: 0 },
        { audio: Buffer.from('part two'), startMs: 6000 },
      ]),
    );
    expect(result.segments.map((s: any) => s.speaker)).toEqual([
      'Speaker 1',
      'Speaker 1',
    ]);
    expect(result.segments[1].startMs).toBe(6000);
  });

  it('keeps words and acoustic identity when punctuation AI tries to rewrite speech', async () => {
    const segments = [
      {
        id: 'one',
        speaker: 'Speaker 1',
        channel: 'mic',
        text: 'oui oui pas 5000',
        rawText: 'oui oui pas 5000',
        startMs: 1,
        endMs: 900,
        confidence: null,
        attribution: 'acoustic',
      },
      {
        id: 'two',
        speaker: 'Speaker 2',
        channel: 'system',
        text: 'je confirme jeudi',
        rawText: 'je confirme jeudi',
        startMs: 1000,
        endMs: 2000,
        confidence: null,
        attribution: 'acoustic',
      },
    ];
    (service as any).ai.isAvailable = () => true;
    (service as any).ai.generate = jest.fn(async () => ({
      text: JSON.stringify({ one: 'Oui, 5000.', two: 'Je confirme jeudi.' }),
    }));
    await (service as any).correctMeetingText(segments);
    expect(segments[0].text).toBe('oui oui pas 5000');
    expect(segments[1].text).toBe('Je confirme jeudi.');
    expect(segments[1].rawText).toBe('je confirme jeudi');
    expect(segments.map((s) => [s.speaker, s.startMs, s.endMs])).toEqual([
      ['Speaker 1', 1, 900],
      ['Speaker 2', 1000, 2000],
    ]);
  });

  it('proposes names from each acoustic self-introduction and still requires review', async () => {
    await service.ingestChunk(actor, meetingId, Buffer.from('mic'), meta('mic', 9000));
    (service as any).stt.transcribeDiarized.mockResolvedValue({
      text: '',
      language: null,
      segments: [
        {
          text: "Bonjour, je m'appelle Alice.",
          startMs: 0,
          endMs: 1000,
          speakerId: 'one',
        },
        {
          text: "Bonjour Alice, je m'appelle Julie.",
          startMs: 3000,
          endMs: 4000,
          speakerId: 'two',
        },
        {
          text: "Je m'appelle Paul.",
          startMs: 6000,
          endMs: 7000,
          speakerId: 'three',
        },
      ],
    });
    (service as any).ai.isAvailable = () => true;
    (service as any).ai.generate = jest.fn(async () => ({ text: '{}' }));
    const { segments } = await (service as any).transcribeMeeting(
      meetingId,
      await (service as any).resolveAudioSources(await meeting()),
    );
    (service as any).ai.generate.mockClear();
    const result = await (service as any).identifySpeakers(meetingId, segments);
    expect(result).toMatchObject({
      total: 3,
      unresolved: 0,
      needsReview: true,
    });
    const record = await db
      .selectFrom('meetingTranscripts')
      .select('speakers')
      .where('meetingId', '=', meetingId)
      .executeTakeFirstOrThrow();
    const names =
      typeof record.speakers === 'string'
        ? JSON.parse(record.speakers)
        : record.speakers;
    expect(Object.values(names).map((s: any) => s.displayName)).toEqual([
      'Alice',
      'Julie',
      'Paul',
    ]);
    expect(Object.values(names).every((s: any) => s.userId === null)).toBe(
      true,
    );
    expect((service as any).ai.generate).not.toHaveBeenCalled();
  });

  it('reads legacy double-encoded manifest/playback fragments without losing the source files', async () => {
    files.set('combined.m4a', Buffer.from('combined playback'));
    const base = {
      chunks: [
        { source: 'mic', sequence: 0, path: 'mic.webm' },
        { source: 'system', sequence: 0, path: 'system.webm' },
      ],
    };
    await db
      .updateTable('meetings')
      .set({
        audioManifest: sql`${JSON.stringify([JSON.stringify(base), { playbackPath: 'combined.m4a' }])}::text::jsonb`,
      })
      .where('id', '=', meetingId)
      .execute();
    const sources = await (service as any).resolveAudioSources(await meeting());
    expect(sources.map((s: any) => s.source)).toEqual(['mic', 'system']);
    expect(
      await (service as any).resolveAudioFile(actor, meetingId, 'original'),
    ).toEqual({ filePath: 'combined.m4a', mime: 'audio/mp4' });
  });
});
