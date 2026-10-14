import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export type PlaybackSource = { audio: Buffer; startMs?: number };

export function playbackArguments(
  inputs: string[],
  starts: number[],
  output: string,
): string[] {
  const filters = inputs.map(
    (_, i) =>
      `[${i}:a]aresample=48000,adelay=${Math.max(0, Math.round(starts[i] || 0))}:all=1[a${i}]`,
  );
  filters.push(
    inputs.map((_, i) => `[a${i}]`).join('') +
      `amix=inputs=${inputs.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=0[out]`,
  );
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-filter_complex_threads',
    '1',
    ...inputs.flatMap((input) => ['-i', input]),
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    '-vn',
    '-ac',
    '2',
    '-ar',
    '48000',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** Mix only for playback. Transcription retains the independent channels. */
export async function mixMeetingPlayback(
  sources: PlaybackSource[],
): Promise<Buffer> {
  if (sources.length === 0) throw new Error('No audio sources to mix');
  const directory = await mkdtemp(join(tmpdir(), 'conqr-meeting-playback-'));
  try {
    const inputs = sources.map((_, i) => join(directory, `input-${i}.audio`));
    await Promise.all(
      sources.map((source, i) => writeFile(inputs[i], source.audio)),
    );
    const output = join(directory, 'playback.m4a');
    await run(
      'ffmpeg',
      playbackArguments(
        inputs,
        sources.map((source) => source.startMs ?? 0),
        output,
      ),
      { timeout: 300_000, maxBuffer: 1024 * 1024, windowsHide: true },
    );
    return await readFile(output);
  } finally {
    if (!directory.startsWith(join(tmpdir(), 'conqr-meeting-playback-'))) {
      throw new Error('Unexpected playback temporary directory');
    }
    await rm(directory, { recursive: true, force: true });
  }
}

/** Loudness of a whole recording, as measured by ffmpeg's volumedetect. */
export type AudioSignal = { meanDb: number; peakDb: number };

/**
 * volumedetect uses signed 16-bit samples: zero samples report -91 dB,
 * while even a single nonzero least-significant bit peaks at -90.3 dB.
 * Keep every measurable nonzero sample, including extremely quiet audio.
 */
export const DIGITAL_SILENCE_PEAK_DB = -91;
/** Above this size the file is not inspected; the existing path runs. */
export const MAX_SIGNAL_INSPECTION_BYTES = 300 * 1024 * 1024;
const SIGNAL_INSPECTION_TIMEOUT_MS = 120_000;

const VOLUME_PATTERNS = {
  mean_volume: /mean_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/,
  max_volume: /max_volume:\s*(-?inf|-?\d+(?:\.\d+)?)\s*dB/,
} as const;

function parseDb(text: string, key: 'mean_volume' | 'max_volume'): number | null {
  const m = VOLUME_PATTERNS[key].exec(text);
  if (!m) return null;
  return m[1].endsWith('inf') ? -Infinity : Number(m[1]);
}

/** Parses ffmpeg volumedetect output; null when it is not there. */
export function parseVolumeDetect(stderr: string): AudioSignal | null {
  const meanDb = parseDb(stderr, 'mean_volume');
  const peakDb = parseDb(stderr, 'max_volume');
  if (meanDb === null || peakDb === null) return null;
  return { meanDb, peakDb };
}

/** Only a measurement can say "silent": unknown is never silence. */
export function isDigitalSilence(signal: AudioSignal | null | undefined): boolean {
  return !!signal && signal.peakDb <= DIGITAL_SILENCE_PEAK_DB;
}

/**
 * Measures a recording locally with ffmpeg (bounded size and time). Returns
 * null when it cannot be measured — ffmpeg missing, unreadable file, too
 * large, timeout — so the caller keeps its existing path instead of
 * guessing.
 */
export async function inspectAudioSignal(audio: Buffer): Promise<AudioSignal | null> {
  if (!audio?.length || audio.length > MAX_SIGNAL_INSPECTION_BYTES) return null;
  const directory = await mkdtemp(join(tmpdir(), 'conqr-meeting-signal-'));
  try {
    const input = join(directory, 'input.audio');
    await writeFile(input, audio);
    const { stderr } = await run(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', input, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
      { timeout: SIGNAL_INSPECTION_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    return parseVolumeDetect(String(stderr ?? ''));
  } catch {
    return null;
  } finally {
    if (directory.startsWith(join(tmpdir(), 'conqr-meeting-signal-'))) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
