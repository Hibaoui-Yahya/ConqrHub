import { useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { sendChatMessage } from "../services/ai-chat-service";
import type {
  AiChatFeedback,
  AiChatMessage,
  AiChatStreamEvent,
  AiChatToolCall,
  ChatAttachment,
  PageMention,
  SendMessageOptions,
} from "../types/ai-chat.types";

type ChatStreamOptions = {
  onChatCreated?: (chatId: string) => void;
};

type LastPayload = {
  content: string;
  mentions: PageMention[];
  attachments: ChatAttachment[];
  options?: SendMessageOptions;
  /** Id of the optimistic user message appended for this send. */
  tempUserMessageId: string;
  /** True once the stream produced `chat_created` or any content/tool event. */
  progressed: boolean;
};

export function useChatStream(
  chatId: string | undefined,
  options?: ChatStreamOptions,
) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<AiChatToolCall[]>(
    [],
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const currentChatIdRef = useRef(chatId);
  currentChatIdRef.current = chatId;
  // Tracks which chatId the local `messages` state currently represents.
  // Set when we seed from a server fetch AND when we optimistically own a
  // freshly-created chat after `chat_created`. This is the single authority
  // marker that keeps server-state effects from clobbering in-flight streams.
  const hydratedChatIdRef = useRef<string | undefined>(undefined);

  // Reset local state when the consumer switches to a different chat.
  // Skip the reset if the new chatId is one the hook itself already claimed
  // during a new-chat flow — in that case our optimistic state is the truth.
  useEffect(() => {
    if (chatId && chatId === hydratedChatIdRef.current) return;
    hydratedChatIdRef.current = undefined;
    setMessages([]);
    setError(null);
    setErrorCode(null);
    setIsRetryable(false);
  }, [chatId]);

  const hydrateFromServer = useCallback((msgs: AiChatMessage[]) => {
    const forId = currentChatIdRef.current;
    if (!forId) return;
    if (hydratedChatIdRef.current === forId) return;
    hydratedChatIdRef.current = forId;
    setMessages(msgs);
  }, []);

  const lastPayloadRef = useRef<LastPayload | null>(null);
  const messagesRef = useRef<AiChatMessage[]>([]);
  messagesRef.current = messages;

  const sendMessage = useCallback(
    (
      content: string,
      mentions: PageMention[] = [],
      attachments: ChatAttachment[] = [],
      sendOptions?: SendMessageOptions,
    ) => {
      if (isStreaming || (!content.trim() && attachments.length === 0)) return;

      const contextPageId = sendOptions?.contextPageId;
      const spaceId = sendOptions?.spaceId;
      const mode = sendOptions?.mode;

      setError(null);
      setErrorCode(null);
      setIsRetryable(false);
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingToolCalls([]);

      const metadata: Record<string, unknown> = {};
      if (mentions.length) {
        metadata.mentionedPageIds = mentions.map((m) => m.id);
      }
      if (attachments.length) {
        metadata.attachments = attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          fileExt: a.fileExt,
        }));
      }

      const tempUserMessageId = `temp-${Date.now()}`;
      const userMessage: AiChatMessage = {
        id: tempUserMessageId,
        chatId: currentChatIdRef.current || "",
        role: "user",
        content,
        toolCalls: null,
        metadata: Object.keys(metadata).length ? metadata : null,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);

      const payload: LastPayload = {
        content,
        mentions,
        attachments,
        options: sendOptions,
        tempUserMessageId,
        progressed: false,
      };
      lastPayloadRef.current = payload;

      const attachmentIds = attachments.map((a) => a.id);

      const abortController = sendChatMessage(
        {
          chatId: currentChatIdRef.current,
          content,
          mentionedPageIds: mentions.map((m) => m.id),
          ...(contextPageId && { contextPageId }),
          ...(attachmentIds.length && { attachmentIds }),
          ...(spaceId && { spaceId }),
          ...(mode === "deep" && { mode }),
        },
        (event: AiChatStreamEvent) => {
          if (event.type !== "error") {
            payload.progressed = true;
          }
          switch (event.type) {
            case "chat_created":
              currentChatIdRef.current = event.chatId;
              // Claim authority over this new chatId so when the consumer's
              // prop catches up via navigation/onChatCreated, the reset effect
              // sees a match and preserves our optimistic messages.
              hydratedChatIdRef.current = event.chatId;
              if (options?.onChatCreated) {
                options.onChatCreated(event.chatId);
              } else {
                navigate(`/ai/chat/${event.chatId}`, { replace: true });
              }
              queryClient.invalidateQueries({ queryKey: ["ai-chats"] });
              break;
            case "content":
              setStreamingContent((prev) => prev + event.text);
              break;
            case "tool_call":
              setStreamingToolCalls((prev) => [
                ...prev,
                {
                  id: event.id,
                  name: event.name,
                  args: event.args,
                },
              ]);
              break;
            case "tool_result":
              setStreamingToolCalls((prev) =>
                prev.map((tc) =>
                  tc.id === event.id ? { ...tc, result: event.result } : tc,
                ),
              );
              break;
            case "done": {
              const doneEvent = event;
              setStreamingContent((currentContent) => {
                setStreamingToolCalls((currentToolCalls) => {
                  const assistantMessage: AiChatMessage = {
                    id: doneEvent.messageId,
                    chatId: currentChatIdRef.current || "",
                    role: "assistant",
                    content: currentContent || null,
                    toolCalls: currentToolCalls.length
                      ? currentToolCalls
                      : null,
                    metadata: {
                      ...(doneEvent.usage
                        ? { tokenUsage: doneEvent.usage }
                        : {}),
                      ...(doneEvent.confidence != null
                        ? { confidence: doneEvent.confidence }
                        : {}),
                      ...(doneEvent.groundedSourceCount
                        ? { groundedSourceCount: doneEvent.groundedSourceCount }
                        : {}),
                      ...(doneEvent.sources?.length
                        ? { sources: doneEvent.sources }
                        : {}),
                      ...(doneEvent.followUps?.length
                        ? { followUps: doneEvent.followUps }
                        : {}),
                    },
                    createdAt: new Date().toISOString(),
                  };

                  setMessages((prev) => [...prev, assistantMessage]);
                  return [];
                });
                return "";
              });
              setIsStreaming(false);
              queryClient.invalidateQueries({
                queryKey: ["ai-chat", currentChatIdRef.current],
              });
              break;
            }
            case "error":
              setError(event.message);
              setErrorCode(event.code || null);
              setIsRetryable(event.retryable || false);
              setIsStreaming(false);
              break;
          }
        },
        (errorMsg) => {
          setError(errorMsg);
          setIsStreaming(false);
        },
        () => {
          setIsStreaming(false);
        },
      );

      abortRef.current = abortController;
    },
    [isStreaming, navigate, queryClient],
  );

  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // Resend the last user message after a failure. If the failed attempt never
  // got past the request (no chat_created / content / tool event), its
  // optimistic user bubble is removed first so the retry does not duplicate it.
  const retryLast = useCallback(() => {
    const last = lastPayloadRef.current;
    if (!last) return;
    if (!last.progressed) {
      setMessages((prev) => prev.filter((m) => m.id !== last.tempUserMessageId));
    }
    setError(null);
    setErrorCode(null);
    setIsRetryable(false);
    // Let the state flush before re-sending so `isStreaming` is observed false.
    setTimeout(() => {
      sendMessageRef.current(
        last.content,
        last.mentions,
        last.attachments,
        last.options,
      );
    }, 0);
  }, []);

  /**
   * Ask again: re-sends the latest user question (same scope and mode) so a
   * new answer is produced. The previous answer stays in the thread.
   */
  const regenerate = useCallback(() => {
    const lastUser = [...messagesRef.current]
      .reverse()
      .find((m) => m.role === "user" && m.content);
    if (!lastUser?.content) return;
    sendMessageRef.current(
      lastUser.content,
      [],
      [],
      lastPayloadRef.current?.options,
    );
  }, []);

  /** Send a follow-up question with the same scope and mode as the last one. */
  const sendFollowUp = useCallback((question: string) => {
    sendMessageRef.current(question, [], [], lastPayloadRef.current?.options);
  }, []);

  // A `forbidden` error (e.g. scope set to a space the user cannot read) is
  // never retryable: the same payload would fail again.
  const canRetry =
    !!error &&
    !isStreaming &&
    !!lastPayloadRef.current &&
    errorCode !== "forbidden";

  // Optimistic local feedback state on an assistant message.
  const setMessageFeedback = useCallback(
    (messageId: string, feedback: AiChatFeedback | null) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                metadata: { ...(m.metadata ?? {}), feedback: feedback ?? undefined },
              }
            : m,
        ),
      );
    },
    [],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    setStreamingContent((currentContent) => {
      setStreamingToolCalls((currentToolCalls) => {
        if (currentContent || currentToolCalls.length > 0) {
          const partialMessage: AiChatMessage = {
            id: `stopped-${Date.now()}`,
            chatId: currentChatIdRef.current || "",
            role: "assistant",
            content: currentContent || null,
            toolCalls: currentToolCalls.length ? currentToolCalls : null,
            metadata: null,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, partialMessage]);
        }
        return [];
      });
      return "";
    });

    setIsStreaming(false);
  }, []);

  return {
    messages,
    streamingContent,
    streamingToolCalls,
    isStreaming,
    error,
    errorCode,
    isRetryable,
    sendMessage,
    retryLast,
    regenerate,
    sendFollowUp,
    canRetry,
    setMessageFeedback,
    stopGeneration,
    hydrateFromServer,
  };
}
