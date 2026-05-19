import api from "@/lib/api-client";
import type { SttContext, SttResult } from "./types";

function unwrap(body: unknown): SttResult {
  if (body && typeof body === "object") {
    const maybe = body as Record<string, unknown>;
    if (
      "data" in maybe &&
      maybe.data &&
      typeof maybe.data === "object" &&
      ("corrected" in maybe.data || "raw" in maybe.data)
    ) {
      return maybe.data as SttResult;
    }
  }
  return body as SttResult;
}

export async function transcribeAudio(
  audio: Blob,
  context: SttContext,
): Promise<SttResult> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  form.append("context", JSON.stringify(context));

  // The server's TransformHttpResponseInterceptor wraps responses as
  // { data, success, status } unless the controller opts out with
  // @SkipTransform(). Tolerate both shapes so we keep working if the
  // controller later changes.
  const body = await api.post("/ai/stt", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return unwrap(body);
}
