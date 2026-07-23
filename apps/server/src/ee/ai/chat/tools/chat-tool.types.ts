import { User } from '@docmost/db/types/entity.types';

export interface ChatToolContext {
  user: User;
  workspaceId: string;
}

export interface ChatTool {
  name: string;
  description: string;
  // zod schema for parameters — typed as any so each tool can import its own schema
  parameters: any;
  execute: (args: any, ctx: ChatToolContext) => Promise<unknown>;
}

/**
 * Rich content blocks a tool may return so the MCP layer forwards them to the
 * client verbatim (e.g. an image the model can actually SEE, or an audio clip)
 * instead of JSON-stringifying the result. A tool signals this by returning an
 * object shaped like `{ __mcpContent: [...] }`. Anything else is stringified.
 *
 * See the MCP `tools/call` content schema (text/image/audio blocks).
 */
export type McpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string };

export interface McpContentResult {
  __mcpContent: McpContentBlock[];
  /** Optional structured payload also surfaced as trailing text for non-MCP callers. */
  meta?: Record<string, unknown>;
}

export function isMcpContentResult(v: unknown): v is McpContentResult {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as McpContentResult).__mcpContent)
  );
}
