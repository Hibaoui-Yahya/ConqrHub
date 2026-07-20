import {
  AdditionalVocabEntry,
  CanonicalTranscript,
  MeetingLanguageConfig,
} from './transcript.types';

export const BATCH_TRANSCRIPTION_PROVIDER = Symbol(
  'BATCH_TRANSCRIPTION_PROVIDER',
);

export type BatchJobStatus =
  | 'running'
  | 'done'
  | 'rejected'
  | 'expired'
  | 'error';

export interface BatchSubmitRequest {
  /** Presigned GET URL the provider fetches audio from (preferred). */
  audioUrl?: string;
  /** Direct upload fallback for small files. */
  audio?: Buffer;
  fileName?: string;
  mime: string;
  language: MeetingLanguageConfig;
  diarization: 'speaker' | 'channel' | 'none';
  speakerSensitivity?: number;
  maxSpeakers?: number;
  channelLabels?: string[];
  additionalVocab?: AdditionalVocabEntry[];
  notification?: {
    url: string;
    /** Sent verbatim as "Authorization: Bearer <token>" to our webhook. */
    authToken: string;
  };
}

export interface BatchTranscriptionProvider {
  readonly name: string;
  isConfigured(): boolean;
  submit(req: BatchSubmitRequest): Promise<{
    providerJobId: string;
    /** Exact config submitted, persisted for audit/reproduction. */
    submittedConfig: Record<string, unknown>;
  }>;
  getStatus(providerJobId: string): Promise<BatchJobStatus>;
  fetchTranscript(providerJobId: string): Promise<{
    canonical: CanonicalTranscript;
    rawPayload: unknown;
  }>;
  /** Best-effort provider-side data deletion. */
  deleteJob(providerJobId: string): Promise<void>;
}
