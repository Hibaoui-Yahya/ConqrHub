/**
 * Thrown by a storage driver when the object is confirmed absent (S3 404 /
 * NoSuchKey / NotFound, or a missing local file). It is the only failure the
 * local read-through fallback treats as "missing": permission, network and
 * provider errors keep their own type and are never masked by a fallback.
 */
export class StorageObjectNotFoundError extends Error {
  readonly code = 'STORAGE_OBJECT_NOT_FOUND';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'StorageObjectNotFoundError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isStorageObjectNotFound(
  err: unknown,
): err is StorageObjectNotFoundError {
  return (
    err instanceof StorageObjectNotFoundError ||
    (err as { code?: string } | null)?.code === 'STORAGE_OBJECT_NOT_FOUND'
  );
}

/**
 * Recognises an S3 "object does not exist" response. GetObject reports
 * `NoSuchKey`; HeadObject has no body, so the SDK reports `NotFound` (or only
 * the 404 status). 403 is deliberately NOT treated as missing: without
 * s3:ListBucket some providers answer 403 for absent keys, but it is also what
 * a wrong key or a revoked credential returns, and hiding that would turn an
 * auth outage into silent "file not found" or a fallback read.
 */
export function isS3NotFoundError(err: unknown): boolean {
  const e = err as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  } | null;
  if (!e) return false;
  if (e.name === 'NoSuchKey' || e.name === 'NotFound') return true;
  if (e.Code === 'NoSuchKey' || e.Code === 'NotFound') return true;
  return e.$metadata?.httpStatusCode === 404;
}
