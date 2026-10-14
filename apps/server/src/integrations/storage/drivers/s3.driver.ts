import { S3StorageConfig, StorageDriver, StorageOption } from '../interfaces';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { streamToBuffer } from '../storage.utils';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getMimeType } from '../../../common/helpers';
import { Upload } from '@aws-sdk/lib-storage';
import { Logger } from '@nestjs/common';
import {
  isS3NotFoundError,
  StorageObjectNotFoundError,
} from '../storage.errors';

/**
 * Builds every S3 client this driver uses, so the regular client and the
 * per-import "recreated" client behave identically. Backblaze B2 (and some
 * other S3-compatible stores) reject the CRC32 checksum headers AWS SDK
 * >= 3.729 sends by default; WHEN_REQUIRED restores the pre-2025 behavior and
 * is safe for AWS/MinIO too. Our own S3 options (bucket, baseUrl) are not SDK
 * options and are stripped. An explicit checksum setting in the config wins.
 */
export function createS3Client(config: S3StorageConfig): S3Client {
  const { bucket: _bucket, baseUrl: _baseUrl, ...sdkConfig } = config;
  return new S3Client({
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    ...(sdkConfig as S3ClientConfig),
  });
}

/**
 * CopySource is sent as a header and must be URL-encoded. Keys contain the
 * original file name (spaces, accents, apostrophes...), so encode each path
 * segment while keeping the separators.
 */
export function encodeCopySource(bucket: string, key: string): string {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

export class S3Driver implements StorageDriver {
  private readonly s3Client: S3Client;
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig) {
    this.config = config;
    this.s3Client = createS3Client(config);
  }

  async upload(filePath: string, file: Buffer | Readable): Promise<void> {
    try {
      const contentType = getMimeType(filePath);

      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.config.bucket,
          Key: filePath,
          Body: file,
          ContentType: contentType,
        },
      });

      await upload.done();
    } catch (err) {
      Logger.error(err);
      throw new Error(`Failed to upload file: ${(err as Error).message}`);
    }
  }

  async uploadStream(
    filePath: string,
    file: Readable,
    options?: { recreateClient?: boolean },
  ): Promise<void> {
    let clientToUse = this.s3Client;
    let shouldDestroyClient = false;

    // optionally recreate client to avoid socket hang errors
    // (during multi-attachments imports)
    if (options?.recreateClient) {
      clientToUse = createS3Client(this.config);
      shouldDestroyClient = true;
    }

    try {
      const contentType = getMimeType(filePath);

      const upload = new Upload({
        client: clientToUse,
        params: {
          Bucket: this.config.bucket,
          Key: filePath,
          Body: file,
          ContentType: contentType,
        },
      });

      await upload.done();
    } catch (err) {
      Logger.error(err);
      throw new Error(`Failed to upload file: ${(err as Error).message}`);
    } finally {
      if (shouldDestroyClient && clientToUse) {
        clientToUse.destroy();
      }
    }
  }

  async copy(fromFilePath: string, toFilePath: string): Promise<void> {
    try {
      if (await this.exists(fromFilePath)) {
        await this.s3Client.send(
          new CopyObjectCommand({
            Bucket: this.config.bucket,
            CopySource: encodeCopySource(this.config.bucket, fromFilePath),
            Key: toFilePath,
          }),
        );
      }
    } catch (err) {
      throw new Error(`Failed to copy file: ${(err as Error).message}`);
    }
  }

  async read(filePath: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: filePath,
      });

      const response = await this.s3Client.send(command);

      return streamToBuffer(response.Body as Readable);
    } catch (err) {
      throw this.readError(err);
    }
  }

  async readStream(filePath: string): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: filePath,
      });

      const response = await this.s3Client.send(command);

      return response.Body as Readable;
    } catch (err) {
      throw this.readError(err);
    }
  }

  async readRangeStream(
    filePath: string,
    range: { start: number; end: number },
  ): Promise<Readable> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: filePath,
        Range: `bytes=${range.start}-${range.end}`,
      });

      const response = await this.s3Client.send(command);

      return response.Body as Readable;
    } catch (err) {
      throw this.readError(err);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: filePath,
      });

      await this.s3Client.send(command);
      return true;
    } catch (err) {
      // HeadObject has no body, so a missing key surfaces as `NotFound` / a
      // bare 404, never as `NoSuchKey`. 403 and network errors still throw.
      if (isS3NotFoundError(err)) {
        return false;
      }
      throw err;
    }
  }

  /**
   * A confirmed-missing object becomes StorageObjectNotFoundError (callers and
   * the local fallback rely on that type); everything else keeps the original
   * message so provider/auth failures stay visible.
   */
  private readError(err: unknown): Error {
    const message = `Failed to read file from S3: ${(err as Error)?.message}`;
    if (isS3NotFoundError(err)) {
      return new StorageObjectNotFoundError(message, { cause: err });
    }
    const error = new Error(message);
    (error as { cause?: unknown }).cause = err;
    return error;
  }

  getUrl(filePath: string): string {
    return `${this.config.baseUrl ?? this.config.endpoint}/${this.config.bucket}/${filePath}`;
  }

  async getSignedUrl(filePath: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: filePath,
    });
    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async delete(filePath: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: filePath,
      });

      await this.s3Client.send(command);
    } catch (err) {
      throw new Error(
        `Error deleting file ${filePath} from S3. ${(err as Error).message}`,
      );
    }
  }

  getDriver(): S3Client {
    return this.s3Client;
  }

  getDriverName(): string {
    return StorageOption.S3;
  }

  getConfig(): Record<string, any> {
    return this.config;
  }
}
