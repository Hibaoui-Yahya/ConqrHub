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
