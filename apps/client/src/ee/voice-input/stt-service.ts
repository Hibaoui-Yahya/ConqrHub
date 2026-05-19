import api from "@/lib/api-client";
import type { SttContext, SttResult } from "./types";

export async function transcribeAudio(
  audio: Blob,
  context: SttContext,
): Promise<SttResult> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  form.append("context", JSON.stringify(context));

  const res = await api.post<SttResult>("/ai/stt", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
