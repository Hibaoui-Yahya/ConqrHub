import { Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { realpath } from 'node:fs/promises';
import { resolve, sep } from 'path';
import { StorageDriver } from '../interfaces';
import {
  isStorageObjectNotFound,
  StorageObjectNotFoundError,
} from '../storage.errors';
import { LocalDriver } from './local.driver';

export const DEFAULT_FALLBACK_TOMBSTONE_PREFIX =
  '.conqr-local-fallback-tombstones/';

/**
 * Keys the fallback may look up on the local volume. Storage keys are always
 * relative, forward-slash paths such as `<workspaceId>/files/<id>/<name>`;
 * anything else (absolute paths, `..` segments, backslashes, NUL bytes,
 * drive letters) is refused before the local driver's own root check runs.
 */
export function isSafeFallbackKey(
  key: string,
  tombstonePrefix: string,
): boolean {
  if (typeof key !== 'string' || key.length === 0 || key.length > 1024) {
    return false;
  }
  if (key.includes('\0') || key.includes('\\')) return false;
  if (key.startsWith('/') || /^[a-zA-Z]:/.test(key)) return false;
  if (key.startsWith(tombstonePrefix)) return false;
  return key
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * Temporary cutover aid for a local → S3 migration, enabled explicitly with
 * STORAGE_LOCAL_READ_FALLBACK=true while STORAGE_DRIVER=s3.
 *
 * S3 stays authoritative: every write and delete goes to S3 only, and a read
 * only reaches the retained local volume when S3 has *confirmed* the object
 * is missing (404). Permission, credential and network errors are rethrown
 * untouched. Nothing is ever copied back from the volume to the same key in
 * S3, so a newer S3 object can never be overwritten by old local bytes.
 *
 * Deleting an object writes an empty tombstone object
 * (`<prefix><key>`) to S3 *before* the delete when the volume still holds a
 * copy, so a deleted file is not resurrected from the volume. Tombstones are
 * inert once the fallback is disabled and can be removed with the prefix.
 */
export class LocalReadFallbackDriver implements StorageDriver {
  private readonly logger = new Logger(LocalReadFallbackDriver.name);
  private readonly fallbackRoot: string;

  constructor(
    private readonly primary: StorageDriver,
    private readonly fallback: LocalDriver,
    private readonly tombstonePrefix: string = DEFAULT_FALLBACK_TOMBSTONE_PREFIX,
  ) {
    this.fallbackRoot = resolve(fallback.getConfig().storagePath);
  }

  upload(filePath: string, file: Buffer | Readable): Promise<void> {
    return this.primary.upload(filePath, file);
  }

  uploadStream(
    filePath: string,
    file: Readable,
    options?: { recreateClient?: boolean },
  ): Promise<void> {
    return this.primary.uploadStream(filePath, file, options);
  }

  async read(filePath: string): Promise<Buffer> {
    try {
      return await this.primary.read(filePath);
    } catch (err) {
      return this.fromFallback(filePath, err, () =>
        this.fallback.read(filePath),
      );
    }
  }

  async readStream(filePath: string): Promise<Readable> {
    try {
      return await this.primary.readStream(filePath);
    } catch (err) {
      return this.fromFallback(filePath, err, () =>
        this.fallback.readStream(filePath),
      );
    }
  }

  async readRangeStream(
    filePath: string,
    range: { start: number; end: number },
  ): Promise<Readable> {
    try {
      return await this.primary.readRangeStream(filePath, range);
    } catch (err) {
      return this.fromFallback(filePath, err, () =>
        this.fallback.readRangeStream(filePath, range),
      );
    }
  }

  async exists(filePath: string): Promise<boolean> {
    if (await this.primary.exists(filePath)) return true;
    return this.availableInFallback(filePath);
  }

  async copy(fromFilePath: string, toFilePath: string): Promise<void> {
    if (await this.primary.exists(fromFilePath)) {
      return this.primary.copy(fromFilePath, toFilePath);
    }
    if (!(await this.availableInFallback(fromFilePath))) {
      // Same contract as the S3 driver: copying a missing source is a no-op.
      return;
    }
    // B2 has no conditional PUT; a HEAD followed by upload can overwrite a
    // concurrent primary write. Reconciliation handles these files instead.
    throw new Error(
      'Local-only source must be reconciled into S3 before copying.',
    );
  }

  getUrl(filePath: string): string {
    return this.primary.getUrl(filePath);
  }

  async getSignedUrl(filePath: string, expireIn: number): Promise<string> {
    if (
      !(await this.primary.exists(filePath)) &&
      (await this.availableInFallback(filePath))
    ) {
      // A presigned URL would point at a missing S3 object; the bytes only
      // exist on the volume until the reconciliation copy runs.
      throw new StorageObjectNotFoundError(
        `Object ${filePath} is only available through the local fallback; no signed URL`,
      );
    }
    return this.primary.getSignedUrl(filePath, expireIn);
  }

  async delete(filePath: string): Promise<void> {
    if (await this.availableInFallback(filePath)) {
      // Tombstone first: if it cannot be written the delete fails loudly
      // rather than leaving a copy the fallback would serve again.
      await this.primary.upload(this.tombstoneKey(filePath), Buffer.alloc(0));
    }
    await this.primary.delete(filePath);
  }

  getDriver(): any {
    return this.primary.getDriver();
  }

  getDriverName(): string {
    return this.primary.getDriverName();
  }

  getConfig(): Record<string, any> {
    return this.primary.getConfig();
  }

  private tombstoneKey(filePath: string): string {
    return `${this.tombstonePrefix}${filePath}`;
  }

  /**
   * True only for a safe key that is not tombstoned and whose file exists
   * inside the retained volume (symlinks escaping the root are refused).
   */
  private async availableInFallback(filePath: string): Promise<boolean> {
    if (!isSafeFallbackKey(filePath, this.tombstonePrefix)) return false;
    if (!(await this.insideRoot(filePath))) return false;
    return !(await this.primary.exists(this.tombstoneKey(filePath)));
  }

  private async insideRoot(filePath: string): Promise<boolean> {
    try {
      const [root, target] = await Promise.all([
        realpath(this.fallbackRoot),
        realpath(resolve(this.fallbackRoot, filePath)),
      ]);
      return target.startsWith(root + sep);
    } catch {
      // Missing file (ENOENT) or unreadable root: nothing to fall back to.
      return false;
    }
  }

  private async fromFallback<T>(
    filePath: string,
    primaryError: unknown,
    readLocal: () => Promise<T>,
  ): Promise<T> {
    if (!isStorageObjectNotFound(primaryError)) throw primaryError;
    if (!(await this.availableInFallback(filePath))) throw primaryError;
    try {
      const result = await readLocal();
      // Info level on purpose: production logs drop `warn`, and operators
      // watch these lines to know when the fallback can be switched off.
      this.logger.log(`Local fallback served ${filePath} (missing in S3)`);
      return result;
    } catch (localErr) {
      if (isStorageObjectNotFound(localErr)) throw primaryError;
      throw localErr;
    }
  }
}
