import { Readable } from 'stream';

/**
 * The real S3Client is kept (config resolution, middleware, presigning); only
 * `send` is replaced so no request leaves the process. Every constructed
 * client is recorded so the recreated-client path can be checked too.
 */
const sendMock = jest.fn();
const constructed: Array<{ input: any; client: any }> = [];
const destroyed: any[] = [];

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  class RecordingS3Client extends actual.S3Client {
    constructor(input: any) {
      super(input);
      constructed.push({ input, client: this });
    }
    send(command: any) {
      return sendMock(command, this);
    }
    destroy() {
      destroyed.push(this);
      super.destroy();
    }
  }
  return { ...actual, S3Client: RecordingS3Client };
});

import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { S3Driver, encodeCopySource } from './s3.driver';
import { StorageObjectNotFoundError } from '../storage.errors';

const B2_CONFIG = {
  endpoint: 'https://s3.us-east-005.backblazeb2.com',
  region: 'us-east-005',
  bucket: 'ConqrHubLTCENV',
  forcePathStyle: true,
  credentials: { accessKeyId: 'AKIAFAKE', secretAccessKey: 'fake-secret' },
};

const s3Error = (name: string, status: number) =>
  Object.assign(new Error(name), {
    name,
    $metadata: { httpStatusCode: status },
  });

beforeEach(() => {
  sendMock.mockReset();
  constructed.length = 0;
  destroyed.length = 0;
});

describe('S3Driver client configuration (Backblaze B2 compatibility)', () => {
  it('builds the main client with WHEN_REQUIRED checksums and without our own keys', async () => {
    new S3Driver(B2_CONFIG);
    const { input, client } = constructed[0];
    expect(input).toMatchObject({
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      endpoint: B2_CONFIG.endpoint,
      region: 'us-east-005',
      forcePathStyle: true,
    });
    expect(input.bucket).toBeUndefined();
    expect(input.baseUrl).toBeUndefined();
    expect(await client.config.requestChecksumCalculation()).toBe(
      'WHEN_REQUIRED',
    );
    expect(await client.config.responseChecksumValidation()).toBe(
      'WHEN_REQUIRED',
    );
  });

  it('lets an explicit checksum setting win (AWS users can opt back in)', () => {
    new S3Driver({
      ...B2_CONFIG,
      requestChecksumCalculation: 'WHEN_SUPPORTED',
    } as any);
    expect(constructed[0].input.requestChecksumCalculation).toBe(
      'WHEN_SUPPORTED',
    );
  });
});

describe('S3Driver uploads', () => {
  it('uploads a buffer with the derived content type to the configured bucket', async () => {
    sendMock.mockResolvedValue({});
    const driver = new S3Driver(B2_CONFIG);
    await driver.upload('ws/files/a/Rapport final.pdf', Buffer.from('%PDF'));
    const [cmd] = sendMock.mock.calls[0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input).toMatchObject({
      Bucket: 'ConqrHubLTCENV',
      Key: 'ws/files/a/Rapport final.pdf',
      ContentType: 'application/pdf',
    });
  });

  it('uploads a stream', async () => {
    sendMock.mockResolvedValue({});
    const driver = new S3Driver(B2_CONFIG);
    await driver.uploadStream(
      'ws/files/a/notes.txt',
      Readable.from([Buffer.from('bonjour')]),
    );
    const [cmd] = sendMock.mock.calls[0];
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.Key).toBe('ws/files/a/notes.txt');
  });

  it('uses a recreated client with the SAME B2-safe settings, then destroys it', async () => {
    sendMock.mockResolvedValue({});
    const driver = new S3Driver(B2_CONFIG);
    await driver.uploadStream(
      'ws/files/a/x.png',
      Readable.from([Buffer.from('png')]),
      {
        recreateClient: true,
      },
    );

    expect(constructed).toHaveLength(2);
    const recreated = constructed[1];
    expect(recreated.input).toMatchObject({
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      endpoint: B2_CONFIG.endpoint,
      forcePathStyle: true,
    });
    expect(sendMock.mock.calls[0][1]).toBe(recreated.client);
    expect(destroyed).toContain(recreated.client);
    expect(destroyed).not.toContain(constructed[0].client);
  });

  it('destroys the recreated client even when the upload fails', async () => {
    sendMock.mockRejectedValue(s3Error('InternalError', 500));
    const driver = new S3Driver(B2_CONFIG);
    await expect(
      driver.uploadStream('k', Readable.from([Buffer.from('x')]), {
        recreateClient: true,
      }),
    ).rejects.toThrow(/Failed to upload file/);
    expect(destroyed).toContain(constructed[1].client);
  });
});

describe('S3Driver.exists', () => {
  it.each([
    ['NotFound (HeadObject has no body)', s3Error('NotFound', 404)],
    ['NoSuchKey', s3Error('NoSuchKey', 404)],
    ['bare 404', s3Error('UnknownError', 404)],
  ])('returns false for %s', async (_label, err) => {
    sendMock.mockRejectedValue(err);
    expect(await new S3Driver(B2_CONFIG).exists('missing')).toBe(false);
    expect(sendMock.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('returns true when the object exists', async () => {
    sendMock.mockResolvedValue({});
    expect(await new S3Driver(B2_CONFIG).exists('k')).toBe(true);
  });

  it.each([
    ['403 AccessDenied', s3Error('AccessDenied', 403)],
    ['401', s3Error('Unauthorized', 401)],
    [
      'network',
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    ],
    ['500', s3Error('InternalError', 500)],
  ])('does not hide %s', async (_label, err) => {
    sendMock.mockRejectedValue(err);
    await expect(new S3Driver(B2_CONFIG).exists('k')).rejects.toBe(err);
  });
});

describe('S3Driver reads', () => {
  it('maps a missing key to StorageObjectNotFoundError, keeping the message', async () => {
    sendMock.mockRejectedValue(s3Error('NoSuchKey', 404));
    const driver = new S3Driver(B2_CONFIG);
    for (const read of [
      () => driver.read('k'),
      () => driver.readStream('k'),
      () => driver.readRangeStream('k', { start: 0, end: 9 }),
    ]) {
      const err = await read().catch((e) => e);
      expect(err).toBeInstanceOf(StorageObjectNotFoundError);
      expect(err.message).toMatch(/^Failed to read file from S3: /);
    }
  });

  it('keeps permission errors as plain errors (not "missing")', async () => {
    sendMock.mockRejectedValue(s3Error('AccessDenied', 403));
    const err = await new S3Driver(B2_CONFIG).read('k').catch((e) => e);
    expect(err).not.toBeInstanceOf(StorageObjectNotFoundError);
    expect(err.message).toBe('Failed to read file from S3: AccessDenied');
  });

  it('reads the full body and sends inclusive byte ranges', async () => {
    sendMock.mockImplementation(async (cmd: any) => ({
      Body: Readable.from([Buffer.from(cmd.input.Range ? 'part' : 'whole')]),
    }));
    const driver = new S3Driver(B2_CONFIG);
    expect((await driver.read('k')).toString()).toBe('whole');
    await driver.readRangeStream('k', { start: 100, end: 199 });
    const rangeCmd = sendMock.mock.calls[1][0];
    expect(rangeCmd).toBeInstanceOf(GetObjectCommand);
    expect(rangeCmd.input).toMatchObject({
      Bucket: 'ConqrHubLTCENV',
      Key: 'k',
      Range: 'bytes=100-199',
    });
  });
});

describe('S3Driver copy and signed URLs with real-world file names', () => {
  const key = "ws/files/0199/Procès-verbal d'été (v2) #1.pdf";

  it('URL-encodes CopySource per segment', async () => {
    sendMock.mockResolvedValue({});
    await new S3Driver(B2_CONFIG).copy(key, 'ws/files/0200/copie.pdf');
    const copy = sendMock.mock.calls.find(
      ([c]) => c instanceof CopyObjectCommand,
    )[0];
    expect(copy.input.CopySource).toBe(
      "ConqrHubLTCENV/ws/files/0199/Proc%C3%A8s-verbal%20d'%C3%A9t%C3%A9%20(v2)%20%231.pdf",
    );
    expect(copy.input.Key).toBe('ws/files/0200/copie.pdf');
    expect(decodeURIComponent(copy.input.CopySource)).toBe(
      `ConqrHubLTCENV/${key}`,
    );
  });

  it('copying a missing source is a no-op, as before', async () => {
    sendMock.mockRejectedValueOnce(s3Error('NotFound', 404));
    await new S3Driver(B2_CONFIG).copy('missing', 'dest');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('encodeCopySource keeps separators', () => {
    expect(encodeCopySource('b', 'a/b c/d')).toBe('b/a/b%20c/d');
  });

  it('presigns a private, path-style GET URL on the B2 endpoint', async () => {
    const url = new URL(await new S3Driver(B2_CONFIG).getSignedUrl(key, 3600));
    expect(url.host).toBe('s3.us-east-005.backblazeb2.com');
    expect(decodeURIComponent(url.pathname)).toBe(`/ConqrHubLTCENV/${key}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toMatch(
      /^AKIAFAKE\/\d{8}\/us-east-005\/s3\/aws4_request$/,
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // No checksum mode is forced into the URL (B2 rejects unknown checksum params).
    expect(url.search).not.toMatch(/x-amz-checksum-mode/i);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('still works for AWS/MinIO style virtual-host configs', async () => {
    const url = new URL(
      await new S3Driver({
        region: 'eu-west-3',
        endpoint: 'https://s3.eu-west-3.amazonaws.com',
        bucket: 'conqr-hub',
        credentials: { accessKeyId: 'AKIAFAKE', secretAccessKey: 'x' },
      } as any).getSignedUrl('ws/a.png', 60),
    );
    expect(url.host).toBe('conqr-hub.s3.eu-west-3.amazonaws.com');
    expect(url.pathname).toBe('/ws/a.png');
  });
});
