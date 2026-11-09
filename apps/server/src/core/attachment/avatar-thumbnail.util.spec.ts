import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import {
  jpegExifOrientation,
  orientationFilters,
  parseThumbnailSize,
  renderAvatarThumbnail,
  thumbnailArguments,
  thumbnailPath,
} from './avatar-thumbnail.util';
import * as thumbnailUtil from './avatar-thumbnail.util';
import { AvatarThumbnailService } from './services/avatar-thumbnail.service';

/** A minimal JPEG header with an EXIF APP1 orientation tag. */
function jpegWithOrientation(orientation: number, littleEndian = false): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write(littleEndian ? 'II' : 'MM', 0, 'latin1');
  const u16 = (v: number, o: number) => (littleEndian ? tiff.writeUInt16LE(v, o) : tiff.writeUInt16BE(v, o));
  const u32 = (v: number, o: number) => (littleEndian ? tiff.writeUInt32LE(v, o) : tiff.writeUInt32BE(v, o));
  u16(42, 2);
  u32(8, 4); // IFD0 offset
  u16(1, 8); // one entry
  u16(0x0112, 10); // Orientation
  u16(3, 12); // SHORT
  u32(1, 14);
  u16(orientation, 18);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, exif, Buffer.from([0xff, 0xd9])]);
}

describe('avatar thumbnails (LTC-06)', () => {
  it('accepts only the fixed sizes', () => {
    expect(parseThumbnailSize('128')).toBe(128);
    expect(parseThumbnailSize('sm')).toBe(64);
    expect(parseThumbnailSize('lg')).toBe(256);
    for (const bad of ['100', '4096', '-1', '128px', '', undefined, '../../etc']) {
      expect(parseThumbnailSize(bad)).toBeNull();
    }
  });

  it('caches beside the original, per size, keyed by the upload file name', () => {
    expect(thumbnailPath('ws-1/avatars/7c9e.jpg', 128, 'webp')).toBe('ws-1/avatars/thumbnails/128/7c9e.webp');
    expect(thumbnailPath('ws-1/avatars/7c9e.jpg', 64, 'png')).toBe('ws-1/avatars/thumbnails/64/7c9e.png');
  });

  it('reads the EXIF orientation of phone photos, big- and little-endian', () => {
    expect(jpegExifOrientation(jpegWithOrientation(6))).toBe(6);
    expect(jpegExifOrientation(jpegWithOrientation(8, true))).toBe(8);
    expect(jpegExifOrientation(jpegWithOrientation(1))).toBe(1);
    expect(jpegExifOrientation(Buffer.from('\x89PNG\r\n', 'latin1'))).toBe(1);
    expect(jpegExifOrientation(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00]))).toBe(1); // truncated
    expect(orientationFilters(6)).toEqual(['transpose=1']);
    expect(orientationFilters(3)).toEqual(['hflip', 'vflip']);
    expect(orientationFilters(1)).toEqual([]);
  });

  it('renders one square frame without metadata and never auto-rotates twice', () => {
    const args = thumbnailArguments('in', 'out.webp', 128, 6, 'webp');
    expect(args).toContain('-noautorotate');
    expect(args.join(' ')).toContain('-vf transpose=1,scale=128:128:force_original_aspect_ratio=increase:flags=lanczos,crop=128:128,setsar=1');
    expect(args.join(' ')).toContain('-map_metadata -1');
    expect(args.slice(-3)).toEqual(['-f', 'webp', 'out.webp']);
  });

  it('serves a cached thumbnail, renders a missing one once, and never touches the original', async () => {
    const files = new Map<string, Buffer>([['ws/avatars/a.jpg', Buffer.from('original-bytes')]]);
    const storage = {
      exists: jest.fn(async (p: string) => files.has(p)),
      read: jest.fn(async (p: string) => files.get(p)!),
      readStream: jest.fn(async (p: string) => Readable.from(files.get(p)!)),
      upload: jest.fn(async (p: string, b: Buffer) => void files.set(p, b)),
      delete: jest.fn(async (p: string) => void files.delete(p)),
    };
    const service = new AvatarThumbnailService(storage as any);
    const render = jest
      .spyOn(thumbnailUtil, 'renderAvatarThumbnail')
      .mockResolvedValue({ buffer: Buffer.from('thumb'), ext: 'webp', mime: 'image/webp' });
    const [a, b] = await Promise.all([service.get('ws/avatars/a.jpg', 128), service.get('ws/avatars/a.jpg', 128)]);
    expect(a?.mime).toBe('image/webp');
    expect(b?.mime).toBe('image/webp');
    expect(render).toHaveBeenCalledTimes(1); // single flight
    expect(files.get('ws/avatars/thumbnails/128/a.webp')?.toString()).toBe('thumb');
    await service.get('ws/avatars/a.jpg', 128);
    expect(render).toHaveBeenCalledTimes(1); // served from the cache
    expect(files.get('ws/avatars/a.jpg')?.toString()).toBe('original-bytes');
    render.mockRejectedValueOnce(new Error('ffmpeg missing'));
    expect(await service.get('ws/avatars/a.jpg', 64)).toBeNull(); // caller serves the original
    await service.deleteFor('ws/avatars/a.jpg');
    expect([...files.keys()]).toEqual(['ws/avatars/a.jpg']);
    render.mockRestore();
  });

  const hasFfmpeg = (() => {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();
  (hasFfmpeg ? it : it.skip)('renders a real 4000×3000 photo into a small square (needs ffmpeg)', async () => {
    const source = execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=4000x3000',
      '-frames:v', '1', '-q:v', '2', '-f', 'mjpeg', 'pipe:1',
    ], { maxBuffer: 64 * 1024 * 1024 });
    const thumb = await renderAvatarThumbnail(source, 128);
    expect(thumb.buffer.length).toBeLessThan(30_000);
    expect(thumb.buffer.length).toBeLessThan(source.length / 10);
  });
});
