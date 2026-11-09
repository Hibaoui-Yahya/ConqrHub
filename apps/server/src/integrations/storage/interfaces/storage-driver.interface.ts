import { Readable } from 'stream';

/**
 * Response headers a signed URL forces on the object it serves, whatever
 * Content-Type the object was stored with (user uploads must never be served
 * as active content).
 */
export interface SignedUrlResponseOverrides {
  contentType?: string;
  contentDisposition?: string;
}

export interface StorageDriver {
  upload(filePath: string, file: Buffer | Readable): Promise<void>;

  uploadStream(filePath: string, file: Readable, options?: { recreateClient?: boolean }): Promise<void>;

  copy(fromFilePath: string, toFilePath: string): Promise<void>;

  read(filePath: string): Promise<Buffer>;

  readStream(filePath: string): Promise<Readable>;

  readRangeStream(
    filePath: string,
    range: { start: number; end: number },
  ): Promise<Readable>;

  exists(filePath: string): Promise<boolean>;

  getUrl(filePath: string): string;

  getSignedUrl(
    filePath: string,
    expireIn: number,
    response?: SignedUrlResponseOverrides,
  ): Promise<string>;

  delete(filePath: string): Promise<void>;

  getDriver(): any;

  getDriverName(): string;

  getConfig(): Record<string, any>;
}
