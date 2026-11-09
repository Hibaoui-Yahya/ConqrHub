import type { TFunction } from "i18next";
import type { AiChatToolCall } from "../types/ai-chat.types";

/**
 * Human labels for every assistant tool (past tense, as the step list is a
 * log of what happened). Keys are English and translated through i18n.
 */
export const TOOL_LABELS: Record<string, string> = {
  rag_retrieve: "Semantic search",
  search_pages: "Searched pages",
  get_page: "Read page",
  list_space_pages: "Listed space pages",
  list_spaces: "Listed spaces",
  list_recent_pages: "Listed recent pages",
  get_page_breadcrumbs: "Read page location",
  get_space_info: "Read space info",
  get_page_comments: "Read page comments",
  get_page_history: "Read page history",
  create_page: "Created page",
  update_page: "Updated page",
  update_page_title: "Renamed page",
  update_page_content: "Updated page content",
  move_page: "Moved page",
  create_comment: "Added a comment",
  list_child_pages: "Listed child pages",
  search_attachments: "Searched attachments",
  read_attachment: "Read attachment",
  list_page_attachments: "Listed page attachments",
  read_page_media: "Viewed page images",
  get_verification_status: "Checked verification status",
  list_unverified_pages: "Listed unverified pages",
  verify_page: "Verified page",
  create_verification: "Set up verification",
  submit_for_approval: "Submitted for approval",
  mark_obsolete: "Marked as obsolete",
  get_current_user: "Read current user",
  list_workspace_members: "Listed workspace members",
  search_suite: "Searched the suite",
  get_guide: "Read the guide",
  get_conqrhub_guide: "Read the guide",
  add_diagram: "Added a diagram",
};

/** Argument names whose value is worth showing inline, in priority order. */
const MAIN_ARG_KEYS = [
  "query",
  "question",
  "title",
  "pageId",
  "page_id",
  "spaceId",
  "space_id",
  "attachmentId",
  "topic",
  "name",
];

const MAX_ARG_LEN = 80;

/** Turn `list_space_pages` into "List space pages". */
export function humanizeToolName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function getToolLabel(name: string, t: TFunction): string {
  const key = TOOL_LABELS[name];
  return key ? t(key) : humanizeToolName(name);
}

/** The most meaningful argument of a tool call, truncated for inline display. */
export function getToolMainArg(toolCall: AiChatToolCall): string | null {
  const args = toolCall.args;
  if (!args || typeof args !== "object") return null;
  for (const key of MAIN_ARG_KEYS) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      const text = value.trim();
      return text.length > MAX_ARG_LEN ? `${text.slice(0, MAX_ARG_LEN - 1)}…` : text;
    }
    if (typeof value === "number") return String(value);
  }
  return null;
}

const MAX_RESULT_BYTES = 4 * 1024;

/** Pretty JSON of args + result, capped at 4 KB with an ellipsis. */
export function formatToolDetails(toolCall: AiChatToolCall): string {
  let text: string;
  try {
    text = JSON.stringify(
      { args: toolCall.args, result: toolCall.result },
      null,
      2,
    );
  } catch {
    text = String(toolCall.result ?? "");
  }
  if (text.length <= MAX_RESULT_BYTES) return text;
  return `${text.slice(0, MAX_RESULT_BYTES)}\n…`;
}
