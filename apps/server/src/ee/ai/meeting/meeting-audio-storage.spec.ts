import { Kysely, CamelCasePlugin, sql } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { MeetingService } from './meeting.service';

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
jest.mock('./meeting-audio.util', () => ({ mixMeetingPlayback: jest.fn(async () => Buffer.from('combined playback')) }));

// This integration spec runs against a disposable local PostgreSQL container.
const suite = process.env.MEETING_TEST_DATABASE_URL ? describe : describe.skip;
suite('meeting audio storage with real concurrent PostgreSQL writes', () => {
  let db: Kysely<any>;
  let service: MeetingService;
  let files: Map<string, Buffer>;
  let storage: any;
  let meetingId: string;
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
        postgres: postgres(process.env.MEETING_TEST_DATABASE_URL, {max: 5}),
      }),
      plugins: [new CamelCasePlugin()],
    });
    await sql`CREATE TABLE meetings (id uuid PRIMARY KEY, status text, deleted_at timestamptz,
      audio_storage_prefix text, audio_manifest jsonb, duration_ms integer, transcript text,
      workspace_id uuid, capture_kind text)`.execute(db);
    await sql`CREATE TABLE meeting_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), meeting_id uuid,
      source text, sequence integer, start_ms integer, duration_ms integer, text text)`.execute(
      db,
    );
    await sql`CREATE TABLE meeting_transcripts (meeting_id uuid, version integer, kind text, status text,
      provider text, language text, segments jsonb, speakers jsonb, is_provisional boolean)`.execute(
      db,
    );
  });
  afterAll(async () => {
    await db?.destroy();
  });
  beforeEach(async () => {
    meetingId = randomUUID();
    files = new Map();
    await db
      .insertInto('meetings')
      .values({
        id: meetingId,
        status: 'recording',
        audioManifest: { retained: true },
        durationMs: 0,
        captureKind: 'live',
        workspaceId: randomUUID(),
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
    );
  });
  const meeting = () =>
    db
      .selectFrom('meetings')
      .selectAll()
      .where('id', '=', meetingId)
      .executeTakeFirstOrThrow();

  it('retains distinct microphone and system bytes and both manifest entries when uploaded together', async () => {
    await Promise.all([
      service.ingestChunk(meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(meetingId, Buffer.from('remote'), meta('system')),
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
    await service.ingestChunk(meetingId, Buffer.from('mic'), meta('mic'));
    await Promise.all([
      service.ingestChunk(meetingId, Buffer.from('replacement'), meta('mic')),
      service.ingestChunk(meetingId, Buffer.from('remote'), meta('system')),
    ]);
    expect((await meeting()).audioManifest.chunks).toHaveLength(2);
    expect(files.size).toBe(2);
    const chunks = (await meeting()).audioManifest.chunks;
    expect(
      files.get(chunks.find((c: any) => c.source === 'mic').path)?.toString(),
    ).toBe('replacement');
  });
  it('takes the longer channel duration without shrinking it on a later short upload', async () => {
    await service.ingestChunk(
      meetingId,
      Buffer.from('remote'),
      meta('system', 7000),
    );
    await service.ingestChunk(meetingId, Buffer.from('mic'), meta('mic', 3000));
    expect((await meeting()).durationMs).toBe(7000);
  });
  it('preserves the other channel if a storage write fails', async () => {
    await service.ingestChunk(meetingId, Buffer.from('mic'), meta('mic'));
    storage.upload.mockRejectedValueOnce(new Error('upload failed'));
    await expect(
      service.ingestChunk(meetingId, Buffer.from('remote'), meta('system')),
    ).rejects.toThrow('upload failed');
    expect((await meeting()).audioManifest.chunks).toHaveLength(1);
    expect(files.size).toBe(1);
  });
  it('rejects closed recordings and invalid source/timing before persisting files', async () => {
    await expect(
      service.ingestChunk(meetingId, Buffer.from('x'), meta('../system')),
    ).rejects.toThrow('Invalid audio');
    await expect(
      service.ingestChunk(meetingId, Buffer.from('x'), meta('mic', -1)),
    ).rejects.toThrow('Invalid audio');
    await db
      .updateTable('meetings')
      .set({ status: 'completed' })
      .where('id', '=', meetingId)
      .execute();
    await expect(
      service.ingestChunk(meetingId, Buffer.from('x'), meta('mic')),
    ).rejects.toThrow('not recording');
    expect(files.size).toBe(0);
  });
  it('transcribes both channels into interleaved distinct speaker turns', async () => {
    await Promise.all([
      service.ingestChunk(meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(meetingId, Buffer.from('remote'), meta('system')),
    ]);
    const sources = await (service as any).resolveAudioSources(await meeting());
    const result = await (service as any).transcribeMeeting(meetingId, sources);
    expect(
      result.segments.map((s: any) => [s.channel, s.speaker, s.text]),
    ).toEqual([
      ['mic', 'Me', 'mic'],
      ['system', 'Participant 1', 'remote'],
    ]);
    expect(result.text).toContain('Me: mic');
    expect(result.text).toContain('Participant 1: remote');
    expect((await meeting()).durationMs).toBe(3000);
  });

  it('persists combined playback as an object while retaining both inputs with the production Postgres.js driver', async () => {
    await Promise.all([service.ingestChunk(meetingId, Buffer.from('mic'), meta('mic')),
      service.ingestChunk(meetingId, Buffer.from('remote'), meta('system'))]);
    const row = await meeting();
    const sources = await (service as any).resolveAudioSources(row);
    await (service as any).prepareCombinedPlayback(row, sources);
    const manifest = (await meeting()).audioManifest;
    expect(typeof manifest).toBe('object'); expect(Array.isArray(manifest)).toBe(false);
    expect(manifest.chunks).toHaveLength(2); expect(manifest.retained).toBe(true);
    expect(files.get(manifest.playbackPath)?.toString()).toBe('combined playback');
    expect(await (service as any).resolveAudioFile(meetingId, 'original')).toEqual({filePath:manifest.playbackPath,mime:'audio/mp4'});
  });

  it('reads legacy double-encoded manifest/playback fragments without losing the source files', async () => {
    files.set('combined.m4a', Buffer.from('combined playback'));
    const base = { chunks: [{ source:'mic',sequence:0,path:'mic.webm' },{ source:'system',sequence:0,path:'system.webm' }] };
    await db.updateTable('meetings').set({
      audioManifest: sql`${JSON.stringify([JSON.stringify(base), {playbackPath:'combined.m4a'}])}::text::jsonb`,
    }).where('id','=',meetingId).execute();
    const sources = await (service as any).resolveAudioSources(await meeting());
    expect(sources.map((s:any)=>s.source)).toEqual(['mic','system']);
    expect(await (service as any).resolveAudioFile(meetingId, 'original')).toEqual({filePath:'combined.m4a',mime:'audio/mp4'});
  });
});
