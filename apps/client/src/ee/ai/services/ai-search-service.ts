import api from "@/lib/api-client.ts";
import { IPageSearchParams } from "@/features/search/types/search.types.ts";

/** One grounding source of the search-palette AI answer (`sources` SSE event). */
export interface IAiSearchSource {
  pageId: string;
  title: string | null;
  kind?: "page" | "expert_insight" | string;
  score?: number;
  excerpt?: string;
  label?: string;
  slugId?: string;
  spaceSlug?: string;
  spaceName?: string;
  verified?: boolean;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  /** Legacy fields still emitted by older servers. */
  similarity?: number;
  distance?: number;
  chunkIndex?: number;
}

export interface IAiSearchResponse {
  answer: string;
  sources?: IAiSearchSource[];
}

export async function aiAnswers(
  params: IPageSearchParams,
  onChunk?: (chunk: { content?: string; sources?: IAiSearchSource[] }) => void,
): Promise<IAiSearchResponse> {
  const response = await fetch("/api/ai/answers", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  let answer = "";
  let sources: any[] = [];
  let buffer = "";

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.content) {
              answer += parsed.content;
              onChunk?.({ content: parsed.content });
            }
            if (parsed.sources) {
              sources = parsed.sources;
              onChunk?.({ sources: parsed.sources });
            }
          } catch (e) {
            if (e instanceof Error) {
              throw e;
            }
            // Skip invalid JSON
          }
        }
      }
    }
  }

  return { answer, sources };
}
