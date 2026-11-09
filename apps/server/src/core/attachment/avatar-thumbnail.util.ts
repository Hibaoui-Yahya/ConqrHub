/**
 * Small square avatar thumbnails (LTC-06). Originals stay untouched; menus,
 * member lists and the ConqrMeet avatar bridge ask for a thumbnail of a
 * fixed size, rendered once with the FFmpeg already shipped in the image
 * and cached next to the original. Only stored files are read — never a
 * URL — so there is no fetch of arbitrary addresses.
 * Pure helpers; unit-tested in avatar-thumbnail.util.spec.ts.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Allowed edge lengths in pixels: 2× the 32/64/128 px the UI shows. */
export const AVATAR_THUMBNAIL_SIZES = [64, 128, 256] as const;
export type AvatarThumbnailSize = (typeof AVATAR_THUMBNAIL_SIZES)[number];

/** Originals above this are never decoded (uploads are capped at 10 MB). */
export const MAX_THUMBNAIL_SOURCE_BYTES = 12 * 1024 * 1024;

const NAMED: Record<string, AvatarThumbnailSize> = { sm: 64, md: 128, lg: 256 };

export function parseThumbnailSize(raw: unknown): AvatarThumbnailSize | null {
  if (typeof raw !== 'string' || !raw) return null;
  if (NAMED[raw]) return NAMED[raw];
  const n = Number(raw);
  return (AVATAR_THUMBNAIL_SIZES as readonly number[]).includes(n)
    ? (n as AvatarThumbnailSize)
    : null;
}

/**
 * Where the thumbnail of `originalPath` is cached. The original's file name
 * is a fresh uuid on every upload, so a new photo never reuses an old
 * thumbnail (cache invalidation by construction).
 */
export function thumbnailPath(
  originalPath: string,
  size: AvatarThumbnailSize,
  ext: 'webp' | 'png',
): string {
  const dir = path.posix.dirname(originalPath);
  const base = path.posix.basename(originalPath, path.posix.extname(originalPath));
  return `${dir}/thumbnails/${size}/${base}.${ext}`;
}

/**
 * EXIF orientation (1–8) of a JPEG, 1 when absent. Phone photos are often
 * stored sideways with this tag; FFmpeg 5 does not apply it, so the
 * thumbnail applies it explicitly.
 */
export function jpegExifOrientation(buf: Buffer): number {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return 1;
    const marker = buf[offset + 1];
    if (marker === 0xda || marker === 0xd9) return 1; // image data: no EXIF
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return 1;
    if (
      marker === 0xe1 &&
      offset + 10 <= buf.length &&
      buf.toString('latin1', offset + 4, offset + 10) === 'Exif\0\0'
    ) {
      return tiffOrientation(buf, offset + 10, Math.min(buf.length, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return 1;
}

function tiffOrientation(buf: Buffer, start: number, end: number): number {
  if (start + 8 > end) return 1;
  const order = buf.toString('latin1', start, start + 2);
  const le = order === 'II';
  if (!le && order !== 'MM') return 1;
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd = start + u32(start + 4);
  if (ifd + 2 > end) return 1;
  const entries = u16(ifd);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) return 1;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

/** FFmpeg filters that turn an EXIF-oriented image upright. */
export function orientationFilters(orientation: number): string[] {
  switch (orientation) {
    case 2:
      return ['hflip'];
    case 3:
      return ['hflip', 'vflip'];
    case 4:
      return ['vflip'];
    case 5:
      return ['transpose=0'];
    case 6:
      return ['transpose=1'];
    case 7:
      return ['transpose=3'];
    case 8:
      return ['transpose=2'];
    default:
      return [];
  }
}

export function thumbnailArguments(
  input: string,
  output: string,
  size: AvatarThumbnailSize,
  orientation: number,
  codec: 'webp' | 'png',
): string[] {
  const filters = [
    ...orientationFilters(orientation),
    // Fill the square, then centre-crop: avatars are shown as circles.
    `scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${size}:${size}`,
    'setsar=1',
  ];
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    // Orientation is applied above, the same way on every FFmpeg version.
    '-noautorotate',
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    filters.join(','),
    '-map_metadata',
    '-1',
    ...(codec === 'webp'
      ? ['-c:v', 'libwebp', '-quality', '82', '-compression_level', '4']
      : ['-c:v', 'png', '-pred', 'mixed']),
    '-f',
    codec === 'webp' ? 'webp' : 'image2',
    output,
  ];
}

/** Render one thumbnail; WebP when the FFmpeg build has it, PNG otherwise. */
export async function renderAvatarThumbnail(
  original: Buffer,
  size: AvatarThumbnailSize,
  ffmpeg = 'ffmpeg',
): Promise<{ buffer: Buffer; ext: 'webp' | 'png'; mime: string }> {
  const prefix = path.join(tmpdir(), 'conqr-avatar-thumb-');
  const directory = await mkdtemp(prefix);
  try {
    const input = path.join(directory, 'original');
    await writeFile(input, original);
    const orientation = jpegExifOrientation(original);
    let lastError: unknown;
    for (const codec of ['webp', 'png'] as const) {
      const output = path.join(directory, `thumbnail.${codec}`);
      try {
        await run(ffmpeg, thumbnailArguments(input, output, size, orientation, codec), {
          timeout: 20_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
        });
        const buffer = await readFile(output);
        if (buffer.length > 0) {
          return { buffer, ext: codec, mime: codec === 'webp' ? 'image/webp' : 'image/png' };
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Thumbnail rendering failed');
  } finally {
    if (directory.startsWith(prefix)) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
