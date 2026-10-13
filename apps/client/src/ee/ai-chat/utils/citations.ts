import type { AiChatSource } from "../types/ai-chat.types";

// Matches [P1], [E2] and comma-separated groups such as [P1, P3].
const CITATION_RE = /\[((?:[PE]\d+)(?:\s*,\s*(?:[PE]\d+))*)\]/g;
// Fenced and inline code segments are left untouched.
const CODE_SEGMENT_RE = /(```[\s\S]*?```|`[^`\n]*`)/g;

function citationChip(label: string): string {
  return `<a href="#" class="cite" data-cite="${label}">${label}</a>`;
}

/**
 * Replace citation markers in markdown with inline chip anchors, outside of
 * code segments. Runs before markdown→HTML conversion (marked passes inline
 * HTML through) and the chips survive DOMPurify because `class` is allowed
 * and `data-cite` is added via ADD_ATTR.
 */
export function injectCitationChips(markdown: string): string {
  return markdown
    .split(CODE_SEGMENT_RE)
    .map((segment, i) => {
      if (i % 2 === 1) return segment; // code segment
      return segment.replace(CITATION_RE, (_m, group: string) =>
        group
          .split(/\s*,\s*/)
          .filter(Boolean)
          .map(citationChip)
          .join(""),
      );
    })
    .join("");
}

/** Index every citation label (P1, P3, E2…) to its source. */
export function buildLabelIndex(
  sources?: AiChatSource[],
): Map<string, AiChatSource> {
  const index = new Map<string, AiChatSource>();
  for (const s of sources ?? []) {
    const labels = s.labels?.length ? s.labels : s.label ? [s.label] : [];
    for (const l of labels) {
      if (!index.has(l)) index.set(l, s);
    }
  }
  return index;
}

/** All labels of a source, de-duplicated, first label kept first. */
export function sourceLabels(s: AiChatSource): string[] {
  const all = [s.label, ...(s.labels ?? [])].filter(Boolean);
  return Array.from(new Set(all));
}
