import { useCallback, useEffect, useMemo, useRef } from "react";
import { Button, Group, Text, Tooltip } from "@mantine/core";
import { IconDownload, IconFilePlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useChatInfoQuery } from "../queries/ai-chat-query";
import { useChatStream } from "../hooks/use-chat-stream";
import ChatMessageList from "./chat-message-list";
import ChatEmptyState from "./chat-empty-state";
import ChatInput, { type ChatInputHandle } from "./chat-input";
import { ChatActionsContext, lastTurnIds } from "./chat-actions-context";
import { downloadChatAsMarkdown } from "../utils/export-chat";
import ChatStreamError from "./chat-stream-error";
import type { HomeAiPromptInitialState } from "@/features/home/components/home-ai-prompt";
import classes from "../styles/ai-chat.module.css";

export default function AiChatLayout() {
  const { chatId } = useParams<{ chatId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const chatInfoQuery = useChatInfoQuery(chatId);
  const { t } = useTranslation();
  const inputRef = useRef<ChatInputHandle>(null);

  // If the URL points at a chat the user does not own, the info fetch 404s.
  // Bounce them back to /ai so they cannot interact with any chat UI (including
  // kicking off orphan uploads) tied to a chat they have no access to.
  useEffect(() => {
    if (chatId && chatInfoQuery.isError) {
      navigate("/ai", { replace: true });
    }
  }, [chatId, chatInfoQuery.isError, navigate]);
  const {
    messages,
    streamingContent,
    streamingToolCalls,
    isStreaming,
    error,
    sendMessage,
    retryLast,
    regenerate,
    sendFollowUp,
    canRetry,
    setMessageFeedback,
    stopGeneration,
    hydrateFromServer,
  } = useChatStream(chatId);

  const autoSentRef = useRef(false);

  useEffect(() => {
    if (chatInfoQuery.data?.messages) {
      hydrateFromServer(chatInfoQuery.data.messages);
    }
  }, [chatInfoQuery.data, hydrateFromServer]);

  useEffect(() => {
    if (autoSentRef.current || chatId) return;
    const state = location.state as HomeAiPromptInitialState | null;
    if (!state?.initialContent && !state?.initialAttachments?.length) return;

    autoSentRef.current = true;
    sendMessage(
      state.initialContent ?? "",
      state.initialMentions ?? [],
      state.initialAttachments ?? [],
    );
    navigate(location.pathname, { replace: true, state: null });
  }, [chatId, location, navigate, sendMessage]);

  const hasMessages = messages.length > 0 || isStreaming || !!chatId;
  const chatTitle = chatInfoQuery.data?.chat?.title || t("New chat");

  const handleEditQuestion = useCallback((text: string) => {
    inputRef.current?.setText(text);
  }, []);

  const handleSaveAsPage = useCallback(() => {
    sendFollowUp(
      t(
        "Save your last answer as a new page. If the space is not obvious, ask me which space to use first.",
      ),
    );
  }, [sendFollowUp, t]);

  const actions = useMemo(
    () => ({
      ...lastTurnIds(messages),
      busy: isStreaming,
      onFollowUp: sendFollowUp,
      onRegenerate: regenerate,
      onEditQuestion: handleEditQuestion,
    }),
    [messages, isStreaming, sendFollowUp, regenerate, handleEditQuestion],
  );
  const hasAnswer = messages.some((m) => m.role === "assistant" && m.content);

  // While the redirect effect is running (or if the user is still on this
  // component for any reason) never render the chat UI for a forbidden chat.
  if (chatId && chatInfoQuery.isError) {
    return null;
  }

  return (
    <ChatActionsContext.Provider value={actions}>
    <div className={classes.main}>
      {hasMessages ? (
        <>
          <div className={classes.chatTopBar}>
            <Text fw={600} size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
              {chatTitle}
            </Text>
            {hasAnswer && (
              <Group gap={6} wrap="nowrap">
                <Tooltip label={t("Ask the assistant to file the last answer as a page")} openDelay={400}>
                  <Button
                    variant="default"
                    size="compact-xs"
                    leftSection={<IconFilePlus size={14} />}
                    disabled={isStreaming}
                    onClick={handleSaveAsPage}
                  >
                    {t("Save as page")}
                  </Button>
                </Tooltip>
                <Button
                  variant="default"
                  size="compact-xs"
                  leftSection={<IconDownload size={14} />}
                  disabled={isStreaming}
                  onClick={() => downloadChatAsMarkdown(chatTitle, messages, t)}
                >
                  {t("Export")}
                </Button>
              </Group>
            )}
          </div>
          <ChatMessageList
            messages={messages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            streamingToolCalls={streamingToolCalls}
            onFeedback={setMessageFeedback}
          />
          {error && (
            <div className={classes.streamError}>
              <ChatStreamError
                error={error}
                canRetry={canRetry}
                onRetry={retryLast}
              />
            </div>
          )}
          <div className={classes.inputArea}>
            <ChatInput
              ref={inputRef}
              isStreaming={isStreaming}
              onSend={sendMessage}
              onStop={stopGeneration}
              chatId={chatId}
              showScope
            />
          </div>
        </>
      ) : (
        <ChatEmptyState
          isStreaming={isStreaming}
          onSend={sendMessage}
          onStop={stopGeneration}
        />
      )}
    </div>
    </ChatActionsContext.Provider>
  );
}
