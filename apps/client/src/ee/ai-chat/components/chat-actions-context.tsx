import { createContext, useContext } from "react";

/**
 * Conversation-level actions a message can trigger (ask a follow-up, ask
 * again, edit the last question). Provided by the chat surface that owns the
 * composer; messages render the matching buttons only when a handler exists.
 */
export type ChatActions = {
  lastUserMessageId?: string;
  lastAssistantMessageId?: string;
  busy: boolean;
  onFollowUp?: (question: string) => void;
  onRegenerate?: () => void;
  onEditQuestion?: (text: string) => void;
};

export const ChatActionsContext = createContext<ChatActions>({ busy: false });

export function useChatActions(): ChatActions {
  return useContext(ChatActionsContext);
}

/** Ids of the newest user and assistant turns, for "last message" actions. */
export function lastTurnIds(
  messages: Array<{ id: string; role: string }>,
): { lastUserMessageId?: string; lastAssistantMessageId?: string } {
  let lastUserMessageId: string | undefined;
  let lastAssistantMessageId: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!lastAssistantMessageId && m.role === "assistant") lastAssistantMessageId = m.id;
    if (!lastUserMessageId && m.role === "user") lastUserMessageId = m.id;
    if (lastUserMessageId && lastAssistantMessageId) break;
  }
  return { lastUserMessageId, lastAssistantMessageId };
}
