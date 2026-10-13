import { useState, useEffect, useCallback } from "react";
import { ActionIcon, Popover, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconPlus,
  IconChevronDown,
  IconArrowsDiagonal,
  IconX,
  IconSparkles,
  IconFileText,
  IconLanguage,
  IconSearch,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { extractPageSlugId } from "@/lib";
import { useChatStream } from "../hooks/use-chat-stream";
import { useChatInfoQuery } from "../queries/ai-chat-query";
import ChatMessageList from "./chat-message-list";
import ChatInput from "./chat-input";
import ChatStreamError from "./chat-stream-error";
import AsideChatHistory from "./aside-chat-history";
import type {
  ChatAttachment,
  PageMention,
  SendMessageOptions,
} from "../types/ai-chat.types";
import classes from "../styles/aside-chat-panel.module.css";

type QuickAction = {
  icon: React.ReactNode;
  /** i18n key; the translated text is both the label and the prompt sent. */
  key: string;
};

export default function AsideChatPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setAsideState] = useAtom(asideStateAtom);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextPages, setContextPages] = useState<PageMention[]>([]);
  const { pageSlug } = useParams();
  const slugId = extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId: slugId });

  const chatInfoQuery = useChatInfoQuery(chatId);
  const {
    messages,
    streamingContent,
    streamingToolCalls,
    isStreaming,
    error,
    sendMessage,
    retryLast,
    canRetry,
    setMessageFeedback,
    stopGeneration,
    hydrateFromServer,
  } = useChatStream(chatId, {
    onChatCreated: (newChatId) => {
      setChatId(newChatId);
    },
  });

  useEffect(() => {
    if (page && !chatId) {
      setContextPages([{ id: page.id, title: page.title || "", slugId: page.slugId }]);
    }
  }, [page, chatId]);

  const handleRemoveContextPage = useCallback((pageId: string) => {
    setContextPages((prev) => prev.filter((p) => p.id !== pageId));
  }, []);

  useEffect(() => {
    if (chatInfoQuery.data?.messages) {
      hydrateFromServer(chatInfoQuery.data.messages);
    }
  }, [chatInfoQuery.data, hydrateFromServer]);

  // Drop the open chatId if the current user lost access to it (404/403 on
  // the info fetch). Reverts the panel to a fresh chat instead of presenting
  // an input tied to a chat the user does not own.
  useEffect(() => {
    if (chatId && chatInfoQuery.isError) {
      setChatId(undefined);
    }
  }, [chatId, chatInfoQuery.isError]);

  const handleNewChat = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      event.preventDefault();
      setChatId(undefined);
      if (page) {
        setContextPages([
          { id: page.id, title: page.title || "", slugId: page.slugId },
        ]);
      }
    },
    [page],
  );

  const handleSelectChat = useCallback((selectedChatId: string) => {
    setChatId(selectedChatId);
    setHistoryOpen(false);
  }, []);

  const handleExpand = useCallback(() => {
    if (chatId) {
      navigate(`/ai/chat/${chatId}`);
    } else {
      navigate("/ai");
    }
    setAsideState({ tab: "", isAsideOpen: false });
  }, [chatId, navigate, setAsideState]);

  const handleClose = useCallback(() => {
    setAsideState({ tab: "", isAsideOpen: false });
  }, [setAsideState]);

  const handleSend = useCallback(
    (
      content: string,
      mentions: PageMention[],
      attachments: ChatAttachment[],
      options?: SendMessageOptions,
    ) => {
      const contextPageId = contextPages.length > 0 ? contextPages[0].id : undefined;
      sendMessage(content, mentions, attachments, {
        ...options,
        ...(contextPageId ? { contextPageId } : {}),
      });
    },
    [sendMessage, contextPages],
  );

  const handleQuickAction = useCallback(
    (prompt: string) => {
      handleSend(prompt, [], []);
    },
    [handleSend],
  );

  const hasMessages = messages.length > 0 || isStreaming;

  // The prompt is sent in the UI language so the assistant answers in it.
  const quickActions: QuickAction[] = [
    { icon: <IconFileText size={16} />, key: "Summarize this page" },
    { icon: <IconLanguage size={16} />, key: "Translate this page" },
    { icon: <IconSearch size={16} />, key: "Analyze this page for insights" },
  ];

  return (
    <div className={classes.panel}>
      <div className={classes.toolbar}>
        <Popover
          opened={historyOpen}
          onChange={setHistoryOpen}
          position="bottom-start"
          width={280}
          shadow="md"
        >
          <Popover.Target>
            <UnstyledButton
              className={classes.titleButton}
              onClick={() => setHistoryOpen((o) => !o)}
            >
              <span className={classes.titleText}>
                {chatInfoQuery.data?.chat?.title || t("New chat")}
              </span>
              <IconChevronDown size={16} stroke={1.75} />
            </UnstyledButton>
          </Popover.Target>
          <Popover.Dropdown>
            <AsideChatHistory activeChatId={chatId} onSelect={handleSelectChat} />
          </Popover.Dropdown>
        </Popover>

        <div className={classes.toolbarSpacer} />

        <Tooltip label={t("New chat")} openDelay={250}>
          <ActionIcon
            component="a"
            href="/ai"
            variant="subtle"
            color="dark"
            onClick={handleNewChat}
          >
            <IconPlus size={20} stroke={1.75} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t("Open full page")} openDelay={250}>
          <ActionIcon variant="subtle" color="dark" onClick={handleExpand}>
            <IconArrowsDiagonal size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t("Close")} openDelay={250}>
          <ActionIcon variant="subtle" color="dark" onClick={handleClose}>
            <IconX size={20} stroke={1.75} />
          </ActionIcon>
        </Tooltip>
      </div>

      {hasMessages ? (
        <>
          <div className={classes.messages} data-aside-chat>
            <ChatMessageList
              messages={messages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              streamingToolCalls={streamingToolCalls}
              onFeedback={setMessageFeedback}
            />
          </div>
        </>
      ) : (
        <div className={classes.emptyState}>
          <IconSparkles size={36} stroke={1.5} className={classes.emptyStateIcon} />
          <div className={classes.emptyStateTitle}>{t("How can I help you today?")}</div>
          <div className={classes.quickActions}>
            {quickActions.map((action) => (
              <button
                key={action.key}
                type="button"
                className={classes.quickAction}
                onClick={() => handleQuickAction(t(action.key))}
              >
                <span className={classes.quickActionIcon}>{action.icon}</span>
                {t(action.key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className={classes.errorArea}>
          <ChatStreamError
            error={error}
            canRetry={canRetry}
            onRetry={retryLast}
            compact
          />
        </div>
      )}

      <div className={classes.inputArea}>
        <ChatInput
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={stopGeneration}
          placeholder={t("Ask anything...")}
          autofocus={false}
          contextPages={contextPages}
          onRemoveContextPage={handleRemoveContextPage}
          variant="flat"
          chatId={chatId}
        />
      </div>
    </div>
  );
}
