import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'stream';
import { LocalDriver } from './local.driver';
import {
  DEFAULT_FALLBACK_TOMBSTONE_PREFIX,
  LocalReadFallbackDriver,
  isSafeFallbackKey,
} from './local-read-fallback.driver';
import { StorageDriver } from '../interfaces';
import { StorageObjectNotFoundError } from '../storage.errors';
import { streamToBuffer } from '../storage.utils';

/** S3 stand-in with the real driver's error contract. */
class MemoryS3 implements StorageDriver {
  objects = new Map<string, Buffer>();
  failWith: Error | null = null;
  /** Fails GETs only (HEAD keeps working), e.g. a 500 or KMS 403 on read. */
  failReadsWith: Error | null = null;
  calls: string[] = [];

  private check(op: string, key: string) {
    this.calls.push(`${op} ${key}`);
    if (this.failWith) throw this.failWith;
    if (this.failReadsWith && op.startsWith('read')) throw this.failReadsWith;
  }
  private get(key: string) {
    const b = this.objects.get(key);
    if (!b)
      throw new StorageObjectNotFoundError(
        `Failed to read file from S3: NoSuchKey`,
      );
    return b;
  }
  async upload(key: string, file: Buffer | Readable) {
    this.check('upload', key);
    this.objects.set(
      key,
      Buffer.isBuffer(file) ? file : await streamToBuffer(file),
    );
  }
  async uploadStream(key: string, file: Readable) {
    this.check('uploadStream', key);
    this.objects.set(key, await streamToBuffer(file));
  }
  async copy(from: string, to: string) {
    this.check('copy', from);
    if (this.objects.has(from)) this.objects.set(to, this.objects.get(from)!);
  }
  async read(key: string) {
    this.check('read', key);
    return this.get(key);
  }
  async readStream(key: string) {
    this.check('readStream', key);
    return Readable.from([this.get(key)]);
  }
  async readRangeStream(key: string, r: { start: number; end: number }) {
    this.check('readRangeStream', key);
    return Readable.from([this.get(key).subarray(r.start, r.end + 1)]);
  }
  async exists(key: string) {
    this.check('exists', key);
    return this.objects.has(key);
  }
  getUrl(key: string) {
    return `https://s3.example/bucket/${key}`;
  }
  async getSignedUrl(key: string, exp: number) {
    return `https://s3.example/bucket/${key}?X-Amz-Expires=${exp}`;
  }
  async delete(key: string) {
    this.check('delete', key);
    this.objects.delete(key);
  }
  getDriver() {
    return 'memory-s3';
  }
  getDriverName() {
    return 's3';
  }
  getConfig() {
    return { bucket: 'bucket' };
  }
}

const KEY = "ws1/files/att1/Procès-verbal d'été.pdf";

let root: string;
let outside: string;
let s3: MemoryS3;
let driver: LocalReadFallbackDriver;

function writeLocal(key: string, data: string) {
  const full = join(root, key);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, data);
}

beforeEach(() => {
  const base = mkdtempSync(join(tmpdir(), 'hub-fallback-'));
  root = join(base, 'storage');
  outside = join(base, 'secrets');
  mkdirSync(root, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'secret.txt'), 'TOP SECRET');
  s3 = new MemoryS3();
  driver = new LocalReadFallbackDriver(
    s3,
    new LocalDriver({ storagePath: root }),
  );
});

afterEach(() => {
  rmSync(join(root, '..'), { recursive: true, force: true });
});

describe('LocalReadFallbackDriver — S3 stays authoritative', () => {
  it('serves S3 bytes when the object exists, without touching the volume', async () => {
    s3.objects.set(KEY, Buffer.from('new from S3'));
    writeLocal(KEY, 'old local copy');
    expect((await driver.read(KEY)).toString()).toBe('new from S3');
    expect(
      (await streamToBuffer(await driver.readStream(KEY))).toString(),
    ).toBe('new from S3');
  });

  it('falls back to the retained volume only for a confirmed-missing object', async () => {
    writeLocal(KEY, 'written during the deploy window');
    expect((await driver.read(KEY)).toString()).toBe(
      'written during the deploy window',
    );
    expect(
      (await streamToBuffer(await driver.readStream(KEY))).toString(),
    ).toBe('written during the deploy window');
    expect(
      (
        await streamToBuffer(
          await driver.readRangeStream(KEY, { start: 0, end: 6 }),
        )
      ).toString(),
    ).toBe('written');
    expect(await driver.exists(KEY)).toBe(true);
  });

  it('never writes retained bytes back over an S3 key on read', async () => {
    writeLocal(KEY, 'local');
    await driver.read(KEY);
    expect(s3.objects.has(KEY)).toBe(false);
    expect(s3.calls.filter((c) => c.startsWith('upload'))).toEqual([]);
  });

  it.each([
    [
      '403 AccessDenied',
      Object.assign(new Error('AccessDenied'), {
        $metadata: { httpStatusCode: 403 },
      }),
    ],
    ['network failure', new Error('socket hang up')],
  ])('does not mask %s with local bytes', async (_label, err) => {
    writeLocal(KEY, 'local');
    s3.failWith = err;
    await expect(driver.read(KEY)).rejects.toBe(err);
    await expect(driver.readStream(KEY)).rejects.toBe(err);
    await expect(driver.exists(KEY)).rejects.toBe(err);
  });

  it('does not serve local bytes when S3 fails a read with anything but 404', async () => {
    writeLocal(KEY, 'stale local bytes');
    const err = Object.assign(new Error('InternalError'), {
      $metadata: { httpStatusCode: 500 },
    });
    s3.failReadsWith = err;
    await expect(driver.read(KEY)).rejects.toBe(err);
    await expect(driver.readStream(KEY)).rejects.toBe(err);
    await expect(
      driver.readRangeStream(KEY, { start: 0, end: 1 }),
    ).rejects.toBe(err);
  });

  it('reports missing everywhere as the original S3 not-found error', async () => {
    const err = await driver.read(KEY).catch((e) => e);
    expect(err).toBeInstanceOf(StorageObjectNotFoundError);
    expect(err.message).toMatch(/S3/);
    expect(await driver.exists(KEY)).toBe(false);
  });

  it('writes go to S3 only', async () => {
    await driver.upload(KEY, Buffer.from('fresh'));
    expect(s3.objects.get(KEY)!.toString()).toBe('fresh');
    expect((await driver.read(KEY)).toString()).toBe('fresh');
    expect(driver.getDriverName()).toBe('s3');
  });
});

describe('LocalReadFallbackDriver — deletes are final', () => {
  it('does not resurrect a deleted object from the volume', async () => {
    writeLocal(KEY, 'retained original');
    await driver.delete(KEY);

    expect(s3.objects.has(`${DEFAULT_FALLBACK_TOMBSTONE_PREFIX}${KEY}`)).toBe(
      true,
    );
    await expect(driver.read(KEY)).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
    expect(await driver.exists(KEY)).toBe(false);
    // The retained original itself is untouched.
    expect(
      (await new LocalDriver({ storagePath: root }).read(KEY)).toString(),
    ).toBe('retained original');
  });

  it('writes the tombstone before deleting, and fails the delete if it cannot', async () => {
    writeLocal(KEY, 'x');
    s3.objects.set(KEY, Buffer.from('s3'));
    const order: string[] = [];
    const upload = s3.upload.bind(s3);
    s3.upload = async (k: string, b: any) => {
      order.push(`upload ${k}`);
      if (k.startsWith(DEFAULT_FALLBACK_TOMBSTONE_PREFIX))
        throw new Error('B2 503');
      return upload(k, b);
    };
    await expect(driver.delete(KEY)).rejects.toThrow('B2 503');
    expect(s3.objects.has(KEY)).toBe(true);
  });

  it('writes no tombstone when the volume has no copy', async () => {
    s3.objects.set(KEY, Buffer.from('s3'));
    await driver.delete(KEY);
    expect([...s3.objects.keys()]).toEqual([]);
  });
});

describe('LocalReadFallbackDriver — copy and signed URLs', () => {
  it('copies from S3 when the source is there', async () => {
    s3.objects.set(KEY, Buffer.from('s3'));
    await driver.copy(KEY, 'ws1/files/att2/copy.pdf');
    expect(s3.objects.get('ws1/files/att2/copy.pdf')!.toString()).toBe('s3');
  });

  it('refuses to copy a local-only source (no HEAD-then-PUT race on B2)', async () => {
    writeLocal(KEY, 'only local');
    s3.objects.set('dest', Buffer.from('newer primary bytes'));
    await expect(driver.copy(KEY, 'dest')).rejects.toThrow(
      'Local-only source must be reconciled into S3 before copying.',
    );
    await expect(driver.copy(KEY, 'fresh-dest')).rejects.toThrow(/reconciled/);
    expect(s3.objects.get('dest')!.toString()).toBe('newer primary bytes');
    expect(s3.objects.has('fresh-dest')).toBe(false);
    expect(s3.calls.filter((c) => c.startsWith('upload'))).toEqual([]);
  });

  it('copying a source missing everywhere stays a no-op', async () => {
    await driver.copy(KEY, 'dest');
    expect(s3.objects.has('dest')).toBe(false);
  });

  it('signs S3 objects, refuses to sign local-only ones', async () => {
    s3.objects.set('a', Buffer.from('x'));
    expect(await driver.getSignedUrl('a', 60)).toContain('X-Amz-Expires=60');
    writeLocal(KEY, 'local');
    await expect(driver.getSignedUrl(KEY, 60)).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });
});

describe('LocalReadFallbackDriver — only safe relative keys reach the volume', () => {
  it.each([
    '../secrets/secret.txt',
    'ws1/../../secrets/secret.txt',
    '/etc/passwd',
    'C:/Windows/win.ini',
    'ws1\\..\\..\\secrets\\secret.txt',
    'ws1//files/x',
    './ws1/files/x',
    `${DEFAULT_FALLBACK_TOMBSTONE_PREFIX}ws1/files/x`,
    'ws1/files/\0x',
    '',
  ])('refuses %j', async (key) => {
    expect(isSafeFallbackKey(key, DEFAULT_FALLBACK_TOMBSTONE_PREFIX)).toBe(
      false,
    );
    await expect(driver.read(key)).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
  });

  it('refuses a link inside the volume that points outside it', async () => {
    mkdirSync(join(root, 'ws1'), { recursive: true });
    // A directory junction needs no privilege on Windows; on POSIX the type
    // argument is ignored and a regular symlink is created.
    symlinkSync(outside, join(root, 'ws1', 'linked'), 'junction');
    await expect(driver.read('ws1/linked/secret.txt')).rejects.toBeInstanceOf(
      StorageObjectNotFoundError,
    );
    expect(await driver.exists('ws1/linked/secret.txt')).toBe(false);
  });

  it('accepts ordinary keys with spaces and accents', () => {
    expect(isSafeFallbackKey(KEY, DEFAULT_FALLBACK_TOMBSTONE_PREFIX)).toBe(
      true,
    );
  });
});
