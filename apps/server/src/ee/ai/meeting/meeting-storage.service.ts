import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../../integrations/storage/storage.service';
import { MeetingRepo } from '@docmost/db/repos/meeting/meeting.repo';
import { Meeting } from '@docmost/db/types/entity.types';

export interface ChunkManifestEntry {
  source: string;
  sequence: number;
  key: string;
  bytes: number;
  sha256: string;
  durationMs: number;
  mime: string;
}

export interface AudioManifest {
  chunks?: ChunkManifestEntry[];
  original?: {
    key: string;
    bytes: number;
    sha256: string;
    mime: string;
  };
  normalized?: { key?: string; skipped?: boolean; reason?: string };
  rawTranscripts?: { version: number; key: string }[];
  warnings?: string[];
}

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/x-m4a': 'm4a',
  'audio/flac': 'flac',
};

/**
 * Storage key layout + audio persistence for meetings
 * (CONQR_B2_STORAGE_DESIGN.md). Tenant isolation comes from the
 * workspace-prefixed keys; the single source of truth for what exists in
 * storage is the meeting's audio_manifest (deletion iterates it — no
 * bucket listing required).
 */
@Injectable()
export class MeetingStorageService {
  private readonly logger = new Logger(MeetingStorageService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly meetingRepo: MeetingRepo,
  ) {}

  buildPrefix(workspaceId: string, meetingId: string, startedAt: Date): string {
    const yyyy = startedAt.getUTCFullYear().toString();
    const mm = (startedAt.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${workspaceId}/meetings/${yyyy}/${mm}/${meetingId}`;
  }

  chunkKey(prefix: string, source: string, sequence: number): string {
    return `${prefix}/channels/${source}-${sequence.toString().padStart(6, '0')}.webm`;
  }

  originalKey(prefix: string, mime: string): string {
    const ext = EXT_BY_MIME[mime] ?? 'bin';
    return `${prefix}/original/audio-original.${ext}`;
  }

  rawTranscriptKey(prefix: string, version: number): string {
    return `${prefix}/transcripts/speechmatics-raw-v${version}.json`;
  }

  manifestKey(prefix: string): string {
    return `${prefix}/audit/processing-manifest.json`;
  }

  sha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Persist a live-capture chunk BEFORE transcription (durability first).
   * Returns the manifest entry; the caller merges it into the meeting.
   */
  async saveChunk(params: {
    meeting: Meeting;
    workspaceId: string;
    audio: Buffer;
    mime: string;
    source: string;
    sequence: number;
    durationMs: number;
  }): Promise<ChunkManifestEntry> {
    const prefix = await this.ensurePrefix(params.meeting, params.workspaceId);
    const key = this.chunkKey(prefix, params.source, params.sequence);
    await this.storageService.upload(key, params.audio);
    const entry: ChunkManifestEntry = {
      source: params.source,
      sequence: params.sequence,
      key,
      bytes: params.audio.length,
      sha256: this.sha256(params.audio),
      durationMs: params.durationMs,
      mime: params.mime,
    };
    await this.appendManifest(params.meeting.id, params.workspaceId, (m) => {
      const chunks = m.chunks ?? [];
      // Idempotent on retried chunk uploads: replace same source+sequence.
      const next = chunks.filter(
        (c) => !(c.source === entry.source && c.sequence === entry.sequence),
      );
      next.push(entry);
      next.sort((a, b) =>
        a.source === b.source ? a.sequence - b.sequence : a.source.localeCompare(b.source),
      );
      return { ...m, chunks: next };
    });
    return entry;
  }

  async saveOriginal(params: {
    meeting: Meeting;
    workspaceId: string;
    data: Buffer;
    mime: string;
  }): Promise<{ key: string; sha256: string }> {
    const prefix = await this.ensurePrefix(params.meeting, params.workspaceId);
    const key = this.originalKey(prefix, params.mime);
    await this.storageService.upload(key, params.data);
    const digest = this.sha256(params.data);
    await this.appendManifest(params.meeting.id, params.workspaceId, (m) => ({
      ...m,
      original: {
        key,
        bytes: params.data.length,
        sha256: digest,
        mime: params.mime,
      },
    }));
    return { key, sha256: digest };
  }

  /**
   * Concatenate persisted live chunks into original/. MediaRecorder chunks
   * from one session form a valid stream when byte-concatenated per source
   * (assumption A4). Prefers the "system" track when both exist — richer
   * audio for batch diarization; tracks stay separate in channels/.
   */
  async assembleOriginalFromChunks(
    meeting: Meeting,
    workspaceId: string,
  ): Promise<{ key: string; sha256: string; mime: string } | null> {
    const manifest = (meeting.audioManifest ?? {}) as AudioManifest;
    if (manifest.original?.key) {
      return { ...manifest.original };
    }
    const chunks = manifest.chunks ?? [];
    if (chunks.length === 0) return null;

    const bySource = new Map<string, ChunkManifestEntry[]>();
    for (const c of chunks) {
      const list = bySource.get(c.source) ?? [];
      list.push(c);
      bySource.set(c.source, list);
    }
    const source = bySource.has('system') ? 'system' : [...bySource.keys()][0];
    const ordered = (bySource.get(source) ?? []).sort(
      (a, b) => a.sequence - b.sequence,
    );

    const buffers: Buffer[] = [];
    for (const chunk of ordered) {
      buffers.push(await this.storageService.read(chunk.key));
    }
    const combined = Buffer.concat(buffers);
    const mime = ordered[0]?.mime ?? 'audio/webm';
    const saved = await this.saveOriginal({
      meeting,
      workspaceId,
      data: combined,
      mime,
    });
    return { ...saved, mime };
  }

  async saveRawTranscript(
    meeting: Meeting,
    workspaceId: string,
    version: number,
    payload: unknown,
  ): Promise<string> {
    const prefix = await this.ensurePrefix(meeting, workspaceId);
    const key = this.rawTranscriptKey(prefix, version);
    await this.storageService.upload(
      key,
      Buffer.from(JSON.stringify(payload), 'utf8'),
    );
    await this.appendManifest(meeting.id, workspaceId, (m) => ({
      ...m,
      rawTranscripts: [
        ...(m.rawTranscripts ?? []).filter((r) => r.version !== version),
        { version, key },
      ],
    }));
    return key;
  }

  /** Presigned fetch_data URLs require an S3-compatible driver (D6). */
  supportsPresignedFetch(): boolean {
    return this.storageService.getDriverName() === 's3';
  }

  async readObject(key: string): Promise<Buffer> {
    return this.storageService.read(key);
  }

  async getPresignedAudioUrl(
    meeting: Meeting,
    target: 'original' | 'normalized',
    expiresInSeconds: number,
  ): Promise<string | null> {
    const manifest = (meeting.audioManifest ?? {}) as AudioManifest;
    const key =
      target === 'original' ? manifest.original?.key : manifest.normalized?.key;
    // The local driver cannot mint signed URLs; playback via presigned
    // links is an S3/B2-only feature (404s cleanly at the API).
    if (!key || !this.supportsPresignedFetch()) return null;
    return this.storageService.getSignedUrl(key, expiresInSeconds);
  }

  /** Delete every storage object recorded in the manifest. */
  async deleteAllObjects(
    meeting: Meeting,
  ): Promise<{ deleted: string[]; failed: { key: string; error: string }[] }> {
    const manifest = (meeting.audioManifest ?? {}) as AudioManifest;
    const keys = new Set<string>();
    for (const c of manifest.chunks ?? []) keys.add(c.key);
    if (manifest.original?.key) keys.add(manifest.original.key);
    if (manifest.normalized?.key) keys.add(manifest.normalized.key);
    for (const r of manifest.rawTranscripts ?? []) keys.add(r.key);
    if (meeting.audioStoragePrefix) {
      keys.add(this.manifestKey(meeting.audioStoragePrefix));
    }

    const deleted: string[] = [];
    const failed: { key: string; error: string }[] = [];
    for (const key of keys) {
      try {
        await this.storageService.delete(key);
        deleted.push(key);
      } catch (err) {
        failed.push({ key, error: (err as Error).message });
      }
    }
    return { deleted, failed };
  }

  async mirrorManifest(meeting: Meeting, workspaceId: string): Promise<void> {
    if (!meeting.audioStoragePrefix) return;
    try {
      const fresh = await this.meetingRepo.findById(meeting.id, workspaceId);
      await this.storageService.upload(
        this.manifestKey(meeting.audioStoragePrefix),
        Buffer.from(JSON.stringify(fresh?.audioManifest ?? {}, null, 2), 'utf8'),
      );
    } catch (err) {
      this.logger.warn(
        `Manifest mirror failed for meeting ${meeting.id}: ${(err as Error).message}`,
      );
    }
  }

  async appendManifestWarning(
    meetingId: string,
    workspaceId: string,
    warning: string,
  ): Promise<void> {
    await this.appendManifest(meetingId, workspaceId, (m) => ({
      ...m,
      warnings: [...new Set([...(m.warnings ?? []), warning])],
    }));
  }

  async recordNormalizationSkipped(
    meetingId: string,
    workspaceId: string,
    reason: string,
  ): Promise<void> {
    await this.appendManifest(meetingId, workspaceId, (m) => ({
      ...m,
      normalized: { skipped: true, reason },
    }));
  }

  private async ensurePrefix(
    meeting: Meeting,
    workspaceId: string,
  ): Promise<string> {
    if (meeting.audioStoragePrefix) return meeting.audioStoragePrefix;
    const startedAt = meeting.startedAt
      ? new Date(meeting.startedAt as unknown as string)
      : new Date();
    const prefix = this.buildPrefix(workspaceId, meeting.id, startedAt);
    await this.meetingRepo.update(meeting.id, workspaceId, {
      audioStoragePrefix: prefix,
    } as never);
    meeting.audioStoragePrefix = prefix;
    return prefix;
  }

  private async appendManifest(
    meetingId: string,
    workspaceId: string,
    mutate: (manifest: AudioManifest) => AudioManifest,
  ): Promise<void> {
    // Read-modify-write; chunk uploads are sequential per meeting in
    // practice (single recorder), and entries are idempotent by key.
    const meeting = await this.meetingRepo.findById(meetingId, workspaceId);
    if (!meeting) return;
    const manifest = (meeting.audioManifest ?? {}) as AudioManifest;
    await this.meetingRepo.update(meetingId, workspaceId, {
      audioManifest: mutate(manifest) as never,
    } as never);
  }
}
