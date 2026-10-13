export type AiChat = {
  id: string;
  workspaceId: string;
  creatorId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiChatToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
};

export type AiChatMessage = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls: AiChatToolCall[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type AiChatSourceKind = 'page' | 'expert_insight';

export type AiChatSource = {
  /** First citation label pointing to this source (e.g. "P1"). */
  label: string;
  /** All citation labels pointing to this source (e.g. ["P1", "P3"]). */
  labels?: string[];
  title: string | null;
  sourceId: string;
  kind: AiChatSourceKind | string;
  score: number;
  slugId?: string;
  spaceSlug?: string;
  spaceName?: string;
  author?: string;
  updatedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  /** Short excerpt of the grounding chunk (<= 240 chars). */
  excerpt?: string;
  /** Whether the page is currently verified (in the AI knowledge base). */
  verified?: boolean;
  verificationStatus?:
    | 'none'
    | 'draft'
    | 'in_approval'
    | 'approved'
    | 'verified'
    | 'expiring'
    | 'obsolete'
    | string;
  verificationExpiresAt?: string | null;
};

export type AiChatFeedbackRating = 'up' | 'down';

export type AiChatFeedback = {
  rating: AiChatFeedbackRating;
  comment?: string;
};

export type SendMessageOptions = {
  /** Page the aside panel is opened on; used as implicit context. */
  contextPageId?: string;
  /** Restrict retrieval to a single space. */
  spaceId?: string;
};

export type AiChatStreamEvent =
  | { type: 'chat_created'; chatId: string }
  | { type: 'content'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; result: unknown }
  | {
      type: 'done';
      messageId: string;
      usage?: Record<string, number>;
      confidence?: number | null;
      groundedSourceCount?: number;
      sources?: AiChatSource[];
    }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };

export type PageMention = {
  id: string;
  title: string;
  slugId: string;
  spaceSlug?: string;
  icon?: string;
};

export type ChatAttachment = {
  id: string;
  fileName: string;
  fileExt: string;
  fileSize: number;
  mimeType: string;
};
