/**
 * RFC 6749 §5.2 / RFC 7591 §3.2.2 style OAuth error. The controller renders it
 * as `{ error, error_description }` with the given HTTP status.
 */
export class OAuthError extends Error {
  constructor(
    readonly error: string,
    readonly errorDescription: string,
    readonly status = 400,
  ) {
    super(`${error}: ${errorDescription}`);
    this.name = 'OAuthError';
  }
}
