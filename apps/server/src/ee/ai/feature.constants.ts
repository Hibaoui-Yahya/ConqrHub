/**
 * Per-surface workspace toggles for the AI subsystem. Stored under
 * workspace.settings.ai = { generative, search, chat, mcp }. Admins can
 * disable any surface independently — defaults are documented per
 * surface in docs/architecture/ai-subsystem.md.
 */
export type AiFeature = 'generative' | 'search' | 'chat' | 'mcp';

export const AI_FEATURE_DEFAULTS: Record<AiFeature, boolean> = {
  generative: true,
  search: true,
  chat: true,
  mcp: false,
};

export const AI_FEATURE_KEY = 'aiFeature';
