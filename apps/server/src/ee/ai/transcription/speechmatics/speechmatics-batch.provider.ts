import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentService } from '../../../../integrations/environment/environment.service';
import {
  BatchJobStatus,
  BatchSubmitRequest,
  BatchTranscriptionProvider,
} from '../transcription-provider.interface';
import { CanonicalTranscript } from '../transcript.types';
import { buildSpeechmaticsJobConfig } from './speechmatics-config.builder';
import { normalizeJsonV2 } from './json-v2.normalizer';

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

/**
 * Thin fetch() client for the Speechmatics batch API (v2).
 * https://docs.speechmatics.com/api-ref/batch — verified 2026-07-20.
 */
@Injectable()
export class SpeechmaticsBatchProvider implements BatchTranscriptionProvider {
  readonly name = 'speechmatics-batch';
  private readonly logger = new Logger(SpeechmaticsBatchProvider.name);

  constructor(private readonly environment: EnvironmentService) {}

  isConfigured(): boolean {
    return Boolean(this.environment.getSpeechmaticsApiKey());
  }

  private baseUrl(): string {
    const region = this.environment.getSpeechmaticsRegion();
    return `https://${region}.asr.api.speechmatics.com/v2`;
  }

  async submit(req: BatchSubmitRequest): Promise<{
    providerJobId: string;
    submittedConfig: Record<string, unknown>;
  }> {
    const { config } = buildSpeechmaticsJobConfig(req, {
      operatingPoint: this.environment.getSpeechmaticsOperatingPoint(),
    });

    const form = new FormData();
    form.append('config', JSON.stringify(config));
    if (!req.audioUrl) {
      if (!req.audio) {
        throw new Error('Speechmatics submit requires audioUrl or audio');
      }
      form.append(
        'data_file',
        new Blob([new Uint8Array(req.audio)], { type: req.mime }),
        req.fileName ?? 'audio',
      );
    }

    const res = await this.request('/jobs', { method: 'POST', body: form });
    const body = (await res.json()) as { id?: string };
    if (!body.id) {
      throw new Error('Speechmatics job submission returned no job id');
    }
    return {
      providerJobId: body.id,
      submittedConfig: config as unknown as Record<string, unknown>,
    };
  }

  async getStatus(providerJobId: string): Promise<BatchJobStatus> {
    const res = await this.request(
      `/jobs/${encodeURIComponent(providerJobId)}`,
      { method: 'GET' },
      { allow404: true },
    );
    if (res.status === 404) return 'expired';
    const body = (await res.json()) as { job?: { status?: string } };
    const status = body.job?.status ?? 'running';
    switch (status) {
      case 'done':
        return 'done';
      case 'rejected':
        return 'rejected';
      case 'expired':
      case 'deleted':
        return 'expired';
      case 'running':
        return 'running';
      default:
        return 'error';
    }
  }

  async fetchTranscript(providerJobId: string): Promise<{
    canonical: CanonicalTranscript;
    rawPayload: unknown;
  }> {
    const res = await this.request(
      `/jobs/${encodeURIComponent(providerJobId)}/transcript?format=json-v2`,
      { method: 'GET' },
    );
    const rawPayload = await res.json();
    return { canonical: normalizeJsonV2(rawPayload), rawPayload };
  }

  async deleteJob(providerJobId: string): Promise<void> {
    try {
      await this.request(
        `/jobs/${encodeURIComponent(providerJobId)}`,
        { method: 'DELETE' },
        { allow404: true },
      );
    } catch (err) {
      // Best-effort: Speechmatics auto-expires job data after 7 days.
      this.logger.warn(
        `Failed to delete Speechmatics job ${providerJobId}: ${(err as Error).message}`,
      );
    }
  }

  private async request(
    path: string,
    init: { method: string; body?: FormData },
    opts?: { allow404?: boolean },
  ): Promise<Response> {
    const apiKey = this.environment.getSpeechmaticsApiKey();
    if (!apiKey) {
      throw new Error('SPEECHMATICS_API_KEY is not configured');
    }

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl()}${path}`, {
          method: init.method,
          headers: { Authorization: `Bearer ${apiKey}` },
          body: init.body,
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok || (opts?.allow404 && res.status === 404)) {
          return res;
        }
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        const text = await safeText(res);
        throw new Error(
          `Speechmatics ${init.method} ${path} failed: ${res.status} ${text}`,
        );
      } catch (err) {
        lastError = err as Error;
        const retryable =
          (err as Error).name === 'TimeoutError' ||
          (err as Error).message.includes('fetch failed');
        if (retryable && attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new Error('Speechmatics request failed');
  }
}

function backoffMs(attempt: number): number {
  const base = 500 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<unreadable body>';
  }
}
