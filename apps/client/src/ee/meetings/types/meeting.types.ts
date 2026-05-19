export type MeetingStatus = "recording" | "finalizing" | "completed" | "failed";

export type MeetingSource = "mic" | "system";

export interface Meeting {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  status: MeetingStatus;
  transcript: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  settings: Record<string, unknown> | null;
  aiOutputs: Partial<Record<"summary" | "actions" | "decisions", string>> | null;
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
  status: MeetingStatus;
  startedAt: string;
}

export interface IngestChunkResponse {
  text: string;
  segmentId: string;
}
