/**
 * Per-surface workspace toggles for the AI subsystem. Stored under
 * workspace.settings.ai = { generative, search, chat, mcp, stt }. Admins can
 * disable any surface independently — defaults are documented per
 * surface in docs/architecture/ai-subsystem.md.
 */
export type AiFeature =
  | 'generative'
  | 'retrieval'
  | 'search'
  | 'chat'
  | 'mcp'
  | 'stt'
  | 'meeting';

export const AI_FEATURE_DEFAULTS: Record<AiFeature, boolean> = {
  generative: true,
  retrieval: true,
  search: true,
  chat: true,
  mcp: false,
  stt: true,
  meeting: true,
};

export const AI_FEATURE_KEY = 'aiFeature';
