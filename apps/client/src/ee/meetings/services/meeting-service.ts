import api from "@/lib/api-client";
import type {
  ActionProposal,
  ApproveSafeResponse,
  CanonicalTranscript,
  IngestChunkResponse,
  Meeting,
  MeetingAudioResponse,
  MeetingDetail,
  MeetingDocument,
  MeetingListResponse,
  MeetingSource,
  MeetingStatusResponse,
  StartMeetingResponse,
} from "../types/meeting.types";

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    const maybe = (body as { data: unknown }).data;
    if (maybe !== undefined) return maybe as T;
  }
  return body as T;
}

export interface StartMeetingOpts {
  consent?: boolean;
  meetingType?: string;
  languageConfig?: Record<string, unknown>;
}

export async function startMeeting(
  title?: string,
  opts: StartMeetingOpts = {},
): Promise<StartMeetingResponse> {
  const body = await api.post("/ai/meeting/start", { title, ...opts });
  return unwrap<StartMeetingResponse>(body);
}

export async function uploadMeetingChunk(
  meetingId: string,
  blob: Blob,
  meta: {
    source: MeetingSource;
    sequence: number;
    startMs: number;
    durationMs: number;
  },
): Promise<IngestChunkResponse> {
  const form = new FormData();
  form.append("file", blob, `chunk-${meta.sequence}.webm`);
  form.append("source", meta.source);
  form.append("sequence", String(meta.sequence));
  form.append("startMs", String(meta.startMs));
  form.append("durationMs", String(meta.durationMs));
  const body = await api.post(`/ai/meeting/${meetingId}/chunk`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return unwrap<IngestChunkResponse>(body);
}

export async function stopMeeting(meetingId: string): Promise<Meeting> {
  const body = await api.post(`/ai/meeting/${meetingId}/stop`, {});
  return unwrap<Meeting>(body);
}

export async function getMeeting(meetingId: string): Promise<MeetingDetail> {
  const body = await api.get(`/ai/meeting/${meetingId}`);
  return unwrap<MeetingDetail>(body);
}

export async function listMeetings(
  opts: { limit?: number; offset?: number } = {},
): Promise<MeetingListResponse> {
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.offset !== undefined) params.set("offset", String(opts.offset));
  const body = await api.get(
    `/ai/meeting${params.toString() ? `?${params.toString()}` : ""}`,
  );
  return unwrap<MeetingListResponse>(body);
}

export async function deleteMeeting(meetingId: string): Promise<void> {
  await api.delete(`/ai/meeting/${meetingId}`);
}

export async function saveAiOutput(
  meetingId: string,
  key: "summary" | "actions" | "decisions",
  value: string,
): Promise<Meeting> {
  const body = await api.post(`/ai/meeting/${meetingId}/ai-output`, {
    key,
    value,
  });
  return unwrap<Meeting>(body);
}

export interface UploadMeetingOpts {
  file: File;
  consent: boolean;
  title?: string;
  meetingType?: string;
  languageConfig?: Record<string, unknown>;
  autoProcess?: boolean;
}

export async function uploadMeeting(opts: UploadMeetingOpts): Promise<Meeting> {
  const form = new FormData();
  // Fields BEFORE the file part: multipart is parsed sequentially, so the
  // server can validate consent without first draining the file stream.
  form.append("consent", opts.consent ? "true" : "false");
  if (opts.title) form.append("title", opts.title);
  if (opts.meetingType) form.append("meetingType", opts.meetingType);
  if (opts.languageConfig) {
    form.append("languageConfig", JSON.stringify(opts.languageConfig));
  }
  if (opts.autoProcess !== undefined) {
    form.append("autoProcess", String(opts.autoProcess));
  }
  form.append("file", opts.file, opts.file.name);
  const body = await api.post("/ai/meeting/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const res = unwrap<{ meeting: Meeting }>(body);
  return res.meeting ?? (res as unknown as Meeting);
}

export async function processMeeting(
  meetingId: string,
  opts: {
    meetingType?: string;
    languageConfig?: Record<string, unknown>;
    force?: boolean;
  } = {},
): Promise<{ status: string }> {
  const body = await api.post(`/ai/meeting/${meetingId}/process`, opts);
  return unwrap<{ status: string }>(body);
}

export async function getMeetingStatus(
  meetingId: string,
): Promise<MeetingStatusResponse> {
  const body = await api.get(`/ai/meeting/${meetingId}/status`);
  return unwrap<MeetingStatusResponse>(body);
}

export async function getMeetingTranscript(
  meetingId: string,
  version: number | "latest" = "latest",
): Promise<CanonicalTranscript> {
  const body = await api.get(
    `/ai/meeting/${meetingId}/transcript?version=${version}`,
  );
  return unwrap<CanonicalTranscript>(body);
}

export interface SpeakerReviewRequest {
  baseVersion: number;
  renames?: Record<string, string>;
  merges?: [string, string][];
  userLinks?: Record<string, string>;
  confirm?: boolean;
}

export async function reviewTranscriptSpeakers(
  meetingId: string,
  req: SpeakerReviewRequest,
): Promise<{ version?: number; confirmed?: boolean }> {
  const body = await api.post(
    `/ai/meeting/${meetingId}/transcript/speakers`,
    req,
  );
  return unwrap<{ version?: number; confirmed?: boolean }>(body);
}

export async function listMeetingDocuments(
  meetingId: string,
): Promise<MeetingDocument[]> {
  const body = await api.get(`/ai/meeting/${meetingId}/documents`);
  const res = unwrap<MeetingDocument[] | { items: MeetingDocument[] }>(body);
  return Array.isArray(res) ? res : (res.items ?? []);
}

export async function publishMeetingDocument(
  meetingId: string,
  documentId: string,
  opts: { spaceId: string; parentPageId?: string | null },
): Promise<{ pageId: string; pageUrl?: string; documentStatus?: string }> {
  const body = await api.post(
    `/ai/meeting/${meetingId}/documents/${documentId}/publish`,
    opts,
  );
  return unwrap<{ pageId: string; pageUrl?: string; documentStatus?: string }>(
    body,
  );
}

export async function listMeetingProposals(
  meetingId: string,
): Promise<ActionProposal[]> {
  const body = await api.get(`/ai/meeting/${meetingId}/proposals`);
  const res = unwrap<ActionProposal[] | { items: ActionProposal[] }>(body);
  return Array.isArray(res) ? res : (res.items ?? []);
}

export async function approveProposal(
  meetingId: string,
  proposalId: string,
  opts: { payload?: Record<string, unknown>; confirmRisk?: boolean } = {},
): Promise<{ status: string }> {
  const body = await api.post(
    `/ai/meeting/${meetingId}/proposals/${proposalId}/approve`,
    opts,
  );
  return unwrap<{ status: string }>(body);
}

export async function rejectProposal(
  meetingId: string,
  proposalId: string,
): Promise<void> {
  await api.post(`/ai/meeting/${meetingId}/proposals/${proposalId}/reject`, {});
}

export async function approveSafeProposals(
  meetingId: string,
): Promise<ApproveSafeResponse> {
  const body = await api.post(
    `/ai/meeting/${meetingId}/proposals/approve-safe`,
    {},
  );
  return unwrap<ApproveSafeResponse>(body);
}

export async function getMeetingAudio(
  meetingId: string,
  target: "original" | "normalized" = "original",
): Promise<MeetingAudioResponse> {
  const body = await api.get(`/ai/meeting/${meetingId}/audio?target=${target}`);
  return unwrap<MeetingAudioResponse>(body);
}
