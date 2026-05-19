import api from "@/lib/api-client";
import type {
  IngestChunkResponse,
  Meeting,
  MeetingDetail,
  MeetingListResponse,
  MeetingSource,
  StartMeetingResponse,
} from "../types/meeting.types";

function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    const maybe = (body as { data: unknown }).data;
    if (maybe !== undefined) return maybe as T;
  }
  return body as T;
}

export async function startMeeting(title?: string): Promise<StartMeetingResponse> {
  const body = await api.post("/ai/meeting/start", { title });
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
