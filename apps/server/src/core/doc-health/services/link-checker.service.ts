import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

export type LinkCheckReason =
  | 'http_4xx'
  | 'http_5xx'
  | 'timeout'
  | 'dns'
  | 'unknown';

export type LinkCheckResult =
  | { ok: true; url: string; httpStatus: number | null }
  | {
      ok: false;
      url: string;
      httpStatus: number | null;
      reason: LinkCheckReason;
    };

type FetchLike = (
  url: string,
  init: { method: string; redirect: 'follow'; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; type?: string }>;

@Injectable()
export class LinkCheckerService {
  private readonly logger = new Logger(LinkCheckerService.name);
  private readonly fetcher: FetchLike;

  constructor(private readonly environmentService: EnvironmentService) {
    // Use the global fetch when available (Node 18+); allow override via
    // setFetcher() in tests.
    this.fetcher = (globalThis as any).fetch as FetchLike;
  }

  /**
   * Allow the test harness to swap in a mocked fetch without monkey-patching
   * the global. Production code never calls this.
   */
  setFetcher(fn: FetchLike): void {
    (this as unknown as { fetcher: FetchLike }).fetcher = fn;
  }

  isEnabled(): boolean {
    return this.environmentService.getDocHealthExternalChecksEnabled();
  }

  async check(url: string): Promise<LinkCheckResult> {
    if (!this.fetcher) {
      // Older runtime without global fetch — treat as unknown so we don't
      // false-flag the page.
      return { ok: false, url, httpStatus: null, reason: 'unknown' };
    }

    const timeoutMs = this.environmentService.getDocHealthExternalCheckTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response = await this.fetcher(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });

      // Some servers reject HEAD with 405 / 501. Fall back to GET.
      if (response.status === 405 || response.status === 501) {
        response = await this.fetcher(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        });
      }

      if (response.ok) {
        return { ok: true, url, httpStatus: response.status };
      }

      const reason: LinkCheckReason =
        response.status >= 500
          ? 'http_5xx'
          : response.status >= 400
            ? 'http_4xx'
            : 'unknown';
      return { ok: false, url, httpStatus: response.status, reason };
    } catch (err) {
      const reason = classifyError(err);
      return { ok: false, url, httpStatus: null, reason };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Check a batch of URLs with a concurrency limit. Returns a Map from URL
   * to result. Hand-rolled fan-out so we don't add a dependency for one
   * use case — p-limit is in deps but we keep this self-contained.
   */
  async checkBatch(urls: string[]): Promise<Map<string, LinkCheckResult>> {
    const out = new Map<string, LinkCheckResult>();
    if (urls.length === 0) return out;

    const concurrency =
      this.environmentService.getDocHealthExternalCheckConcurrency();
    const queue = [...urls];
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length > 0) {
          const url = queue.shift();
          if (!url) break;
          try {
            const result = await this.check(url);
            out.set(url, result);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'Unknown error';
            this.logger.warn(`Link check threw for ${url}: ${message}`);
            out.set(url, {
              ok: false,
              url,
              httpStatus: null,
              reason: 'unknown',
            });
          }
        }
      },
    );
    await Promise.all(workers);
    return out;
  }
}

function classifyError(err: unknown): LinkCheckReason {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name?: string }).name;
    if (name === 'AbortError' || name === 'TimeoutError') return 'timeout';
  }
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    message.includes('enotfound') ||
    message.includes('eai_again') ||
    message.includes('getaddrinfo') ||
    message.includes('econnrefused')
  ) {
    return 'dns';
  }
  return 'unknown';
}
