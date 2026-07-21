export type MeetingStatus = "recording" | "finalizing" | "completed" | "failed";

/**
 * Full pipeline status set introduced by the meeting-intelligence backend.
 * Includes the legacy live-capture states for older rows.
 */
export type MeetingStatusEx =
  | MeetingStatus
  | "created"
  | "uploading"
  | "uploaded"
  | "normalizing_audio"
  | "batch_submitted"
  | "batch_processing"
  | "transcribed"
  | "speakers_pending_review"
  | "analyzing"
  | "documents_generating"
  | "proposals_generating"
  | "awaiting_review"
  | "published"
  | "partially_failed"
  | "archived"
  | "deletion_pending"
  | "deleted"
  | "stopping";

export type MeetingSource = "mic" | "system";

export type MeetingCaptureKind = "live" | "upload";

export type MeetingTypeId =
  | "generic-meeting"
  | "daily-standup"
  | "sprint-planning"
  | "sales-discovery"
  | "recruitment-interview";

export const MEETING_TYPE_OPTIONS: { value: MeetingTypeId; label: string }[] = [
  { value: "generic-meeting", label: "Generic meeting" },
  { value: "daily-standup", label: "Daily stand-up" },
  { value: "sprint-planning", label: "Sprint planning" },
  { value: "sales-discovery", label: "Sales discovery" },
  { value: "recruitment-interview", label: "Recruitment interview" },
];

export interface Meeting {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  status: MeetingStatusEx;
  transcript: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  settings: Record<string, unknown> | null;
  aiOutputs: Partial<
    Record<"summary" | "actions" | "decisions", string>
  > | null;
  captureKind: MeetingCaptureKind | null;
  meetingType: string | null;
  meetingTypeSource: string | null;
  meetingTypeConfidence: number | null;
  consentConfirmedAt: string | null;
  failureReason: string | null;
  cost: Record<string, unknown> | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MeetingSegment {
  id: string;
  meetingId: string;
  source: MeetingSource;
  sequence: number;
  text: string;
  startMs: number;
  durationMs: number;
  createdAt: string;
}

export interface MeetingListResponse {
  items: Meeting[];
  total: number;
}

export interface MeetingDetail {
  meeting: Meeting;
  segments: MeetingSegment[];
}

export interface StartMeetingResponse {
  id: string;
  title: string;
  status: MeetingStatusEx;
  startedAt: string;
}

export interface IngestChunkResponse {
  text: string;
  segmentId: string;
}

export interface TranscriptVersion {
  version: number;
  kind: "live" | "canonical";
  status: string;
  provider?: string | null;
  language?: string | null;
  createdAt?: string;
}

export interface TranscriptSegmentEx {
  id: string;
  speaker: string;
  channel: string | null;
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

export interface TranscriptSpeaker {
  label: string;
  displayName: string | null;
  userId: string | null;
  confidence: number | null;
}

export interface CanonicalTranscript {
  version: number;
  kind: "live" | "canonical";
  status: string;
  provider: string | null;
  language: string | null;
  segments: TranscriptSegmentEx[];
  speakers: Record<string, TranscriptSpeaker>;
}

export interface MeetingProcessingEvent {
  event: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface MeetingStatusResponse {
  status: MeetingStatusEx;
  meetingType: string | null;
  meetingTypeSource: string | null;
  meetingTypeConfidence: number | null;
  consentConfirmedAt?: string | null;
  failureReason?: string | null;
  cost?: Record<string, unknown> | null;
  /** True only when an S3/B2 driver is active and original audio is stored. */
  audioAvailable?: boolean;
  transcriptVersions: TranscriptVersion[];
  events: MeetingProcessingEvent[];
}

export interface MeetingDocument {
  id: string;
  title: string;
  contentMarkdown: string;
  structured: Record<string, unknown> | null;
  status: string;
  templateId: string | null;
  transcriptVersion: number | null;
  pageId: string | null;
  createdAt: string;
}

export type ProposalStatus =
  | "proposed"
  | "draft"
  | "approved"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "skipped";

export interface ProposalEvidence {
  segmentIds: string[];
  quote: string;
}

export interface ProposalDuplicateCandidate {
  id?: string;
  urn?: string;
  title: string;
  url?: string;
}

export interface ActionProposal {
  id: string;
  kind: string;
  targetApp: string;
  title: string;
  payload: Record<string, unknown>;
  reason: string | null;
  evidence: ProposalEvidence[];
  confidence: number | null;
  commitment: string | null;
  riskLevel: "safe" | "risky" | string;
  validation: { warnings: string[]; missingFields: string[] } | null;
  duplicateCheck: {
    searched: boolean;
    candidates: ProposalDuplicateCandidate[];
  } | null;
  status: ProposalStatus;
  executionResult: {
    entityId?: string;
    url?: string;
    error?: string;
  } | null;
}

export interface ApproveSafeResponse {
  approved: string[];
  skipped: { id: string; reason: string }[];
}

export interface MeetingAudioResponse {
  url: string;
  expiresIn: number;
}

/** Statuses where the pipeline is actively working and the UI should poll. */
export const MEETING_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "awaiting_review",
  "published",
  "failed",
  "partially_failed",
  "completed",
  "archived",
  "deletion_pending",
  "deleted",
]);

export function isMeetingProcessing(
  status: string | null | undefined,
): boolean {
  if (!status) return false;
  if (status === "recording" || status === "created") return false;
  return !MEETING_TERMINAL_STATUSES.has(status);
}
