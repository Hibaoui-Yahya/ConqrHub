export type SttContextKind = "chat" | "ask-ai" | "search" | "page";

export interface SttContext {
  kind: SttContextKind;
  pageId?: string;
  chatId?: string;
  mentionPageIds?: string[];
}

export interface SttResult {
  raw: string;
  corrected: string;
  model: string;
  durationMs: number;
}

export type RecordingState = "idle" | "recording" | "transcribing" | "error";
