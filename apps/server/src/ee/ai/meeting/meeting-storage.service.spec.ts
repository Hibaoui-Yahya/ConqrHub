import { MeetingStorageService } from './meeting-storage.service';
import { Meeting } from '@docmost/db/types/entity.types';

function buildService() {
  const objects = new Map<string, Buffer>();
  const storageService = {
    upload: jest.fn(async (key: string, data: Buffer) => {
      objects.set(key, data);
    }),
    read: jest.fn(async (key: string) => {
      const buf = objects.get(key);
      if (!buf) throw new Error(`missing ${key}`);
      return buf;
    }),
    getSignedUrl: jest.fn(async (key: string) => `https://signed/${key}`),
    delete: jest.fn(async (key: string) => {
      if (key.includes('sticky')) throw new Error('permission denied');
      objects.delete(key);
    }),
  };
  const meetings = new Map<string, Record<string, unknown>>();
  const meetingRepo = {
    findById: jest.fn(async (id: string) => meetings.get(id)),
    update: jest.fn(async (id: string, _ws: string, patch: Record<string, unknown>) => {
      meetings.set(id, { ...(meetings.get(id) ?? {}), ...patch });
      return meetings.get(id);
    }),
  };
  const service = new MeetingStorageService(
    storageService as never,
    meetingRepo as never,
  );
  return { service, storageService, meetingRepo, meetings, objects };
}

function meetingRow(extra: Record<string, unknown> = {}): Meeting {
  return {
    id: 'meet-1',
    workspaceId: 'ws-1',
    startedAt: new Date('2026-07-20T10:00:00Z'),
    audioStoragePrefix: null,
    audioManifest: {},
    ...extra,
  } as never;
}

describe('MeetingStorageService', () => {
  it('builds tenant-isolated, date-partitioned key prefixes (D2)', () => {
    const { service } = buildService();
    expect(
      service.buildPrefix('ws-1', 'meet-1', new Date('2026-07-20T10:00:00Z')),
    ).toBe('ws-1/meetings/2026/07/meet-1');
  });

  it('formats chunk and transcript keys per the storage layout', () => {
    const { service } = buildService();
    const prefix = 'ws-1/meetings/2026/07/meet-1';
    expect(service.chunkKey(prefix, 'mic', 3)).toBe(
      `${prefix}/channels/mic-000003.webm`,
    );
    expect(service.originalKey(prefix, 'audio/mp4')).toBe(
      `${prefix}/original/audio-original.m4a`,
    );
    expect(service.rawTranscriptKey(prefix, 2)).toBe(
      `${prefix}/transcripts/speechmatics-raw-v2.json`,
    );
    expect(service.manifestKey(prefix)).toBe(
      `${prefix}/audit/processing-manifest.json`,
    );
  });

  it('persists chunks with sha256 checksums into the manifest', async () => {
    const { service, meetings } = buildService();
    meetings.set('meet-1', meetingRow());
    const entry = await service.saveChunk({
      meeting: meetings.get('meet-1') as never,
      workspaceId: 'ws-1',
      audio: Buffer.from('audio-bytes'),
      mime: 'audio/webm',
      source: 'mic',
      sequence: 0,
      durationMs: 15000,
    });
    expect(entry.sha256).toHaveLength(64);
    expect(entry.key).toContain('/channels/mic-000000.webm');
    const manifest = meetings.get('meet-1')!.audioManifest as {
      chunks: { sequence: number }[];
    };
    expect(manifest.chunks).toHaveLength(1);
  });

  it('replaces retried chunks idempotently (same source+sequence)', async () => {
    const { service, meetings } = buildService();
    meetings.set('meet-1', meetingRow());
    for (let i = 0; i < 2; i++) {
      await service.saveChunk({
        meeting: meetings.get('meet-1') as never,
        workspaceId: 'ws-1',
        audio: Buffer.from(`attempt-${i}`),
        mime: 'audio/webm',
        source: 'mic',
        sequence: 5,
        durationMs: 1000,
      });
    }
    const manifest = meetings.get('meet-1')!.audioManifest as {
      chunks: unknown[];
    };
    expect(manifest.chunks).toHaveLength(1);
  });

  it('concatenates chunks into original/, preferring the system track', async () => {
    const { service, meetings, objects } = buildService();
    meetings.set('meet-1', meetingRow());
    const m = () => meetings.get('meet-1') as never;
    await service.saveChunk({
      meeting: m(), workspaceId: 'ws-1', audio: Buffer.from('MIC0'),
      mime: 'audio/webm', source: 'mic', sequence: 0, durationMs: 1,
    });
    await service.saveChunk({
      meeting: m(), workspaceId: 'ws-1', audio: Buffer.from('SYS0'),
      mime: 'audio/webm', source: 'system', sequence: 0, durationMs: 1,
    });
    await service.saveChunk({
      meeting: m(), workspaceId: 'ws-1', audio: Buffer.from('SYS1'),
      mime: 'audio/webm', source: 'system', sequence: 1, durationMs: 1,
    });
    const result = await service.assembleOriginalFromChunks(m(), 'ws-1');
    expect(result).not.toBeNull();
    const stored = objects.get(result!.key)!;
    expect(stored.toString()).toBe('SYS0SYS1');
  });

  it('deletes every manifest-recorded object and reports failures honestly', async () => {
    const { service } = buildService();
    const meeting = meetingRow({
      audioStoragePrefix: 'ws-1/meetings/2026/07/meet-1',
      audioManifest: {
        chunks: [{ key: 'a/chunk-0', source: 'mic', sequence: 0 }],
        original: { key: 'a/original-sticky' },
        rawTranscripts: [{ version: 1, key: 'a/raw-1' }],
      },
    });
    const { deleted, failed } = await service.deleteAllObjects(meeting);
    expect(deleted).toEqual(
      expect.arrayContaining([
        'a/chunk-0',
        'a/raw-1',
        'ws-1/meetings/2026/07/meet-1/audit/processing-manifest.json',
      ]),
    );
    expect(failed).toEqual([
      { key: 'a/original-sticky', error: 'permission denied' },
    ]);
  });

  it('issues presigned URLs only for keys recorded in the manifest', async () => {
    const { service } = buildService();
    const meeting = meetingRow({
      audioManifest: { original: { key: 'k/original.webm' } },
    });
    expect(await service.getPresignedAudioUrl(meeting, 'original', 300)).toBe(
      'https://signed/k/original.webm',
    );
    expect(await service.getPresignedAudioUrl(meeting, 'normalized', 300)).toBeNull();
  });
});
