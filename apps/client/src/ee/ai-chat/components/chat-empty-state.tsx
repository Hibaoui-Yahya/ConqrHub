import { useRef } from "react";
import { Link } from "react-router-dom";
import {
  IconSparkles,
  IconSearch,
  IconFileText,
  IconShieldCheck,
  IconReport,
  IconArrowsLeftRight,
  IconClockEdit,
  IconArrowBigRightLines,
  IconDatabase,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ChatInput, { type ChatInputHandle } from "./chat-input";
import type {
  ChatAttachment,
  PageMention,
  SendMessageOptions,
} from "../types/ai-chat.types";
import { useVerificationOverviewQuery } from "@/ee/page-verification/queries/page-verification-query";
import classes from "../styles/ai-chat.module.css";

type Suggestion = {
  icon: React.ReactNode;
  /** i18n key; the English text doubles as the prompt sent/inserted. */
  key: string;
};

// Knowledge-work prompts that make sense for an HR agency and for any wiki.
// Prompts ending with "@" or "…" are inserted into the composer for the user
// to complete; the others are sent immediately.
const SUGGESTIONS: Suggestion[] = [
  {
    icon: <IconSearch size={18} />,
    key: "What do our interview guides say about …",
  },
  {
    icon: <IconFileText size={18} />,
    key: "Summarize the page @",
  },
  {
    icon: <IconShieldCheck size={18} />,
    key: "Which pages are not verified yet?",
  },
  {
    icon: <IconReport size={18} />,
    key: "Write a report from @",
  },
  {
    icon: <IconArrowsLeftRight size={18} />,
    key: "Compare @ and @",
  },
  {
    icon: <IconClockEdit size={18} />,
    key: "Show the pages modified this week",
  },
];

function isFillInPrompt(prompt: string): boolean {
  const trimmed = prompt.trimEnd();
  return trimmed.endsWith("@") || trimmed.endsWith("…") || trimmed.endsWith("...");
}

type Props = {
  isStreaming: boolean;
  onSend: (
    content: string,
    mentions: PageMention[],
    attachments: ChatAttachment[],
    options?: SendMessageOptions,
  ) => void;
  onStop: () => void;
};

export default function ChatEmptyState({ isStreaming, onSend, onStop }: Props) {
  const { t } = useTranslation();
  const inputRef = useRef<ChatInputHandle>(null);
  const overviewQuery = useVerificationOverviewQuery();

  const handleSuggestionClick = (key: string) => {
    const prompt = t(key);
    if (isFillInPrompt(prompt)) {
      // Drop a trailing ellipsis so the user continues the sentence; keep a
      // trailing "@" (no space after it) so the page-mention picker opens.
      const trimmed = prompt.trimEnd();
      const text = trimmed.endsWith("@")
        ? trimmed
        : `${trimmed.replace(/(…|\.\.\.)$/, "").trimEnd()} `;
      inputRef.current?.insertText(text);
      return;
    }
    onSend(prompt, [], []);
  };

  const overview = overviewQuery.data;
  const showKbStatus = !overviewQuery.isError && !!overview;

  return (
    <div className={classes.emptyState}>
      <div className={classes.emptyStateHero}>
        <div className={classes.emptyStateIconWrapper}>
          <IconSparkles size={32} stroke={1.5} className={classes.emptyStateIcon} />
        </div>
        <div className={classes.emptyStateBrand}>{t("ConqrAI")}</div>
        <div className={classes.emptyStateTitle}>
          {t("How can I help you today?")}
        </div>
        <div className={classes.emptyStateSubtitle}>
          {t("Search pages, create content, or get insights — all in one place.")}
        </div>
        {showKbStatus && (
          <Link to="/settings/knowledge-base" className={classes.kbStatus}>
            <IconDatabase size={13} />
            <span>
              {t(
                "Knowledge base: {{verified}} verified pages · {{unverified}} to verify",
                {
                  verified: overview.verified ?? 0,
                  unverified: overview.unverified ?? 0,
                },
              )}
            </span>
          </Link>
        )}
      </div>

      <div className={classes.emptyStateInput}>
        <ChatInput
          ref={inputRef}
          isStreaming={isStreaming}
          onSend={onSend}
          onStop={onStop}
          placeholder={t("Ask anything... Use @ to mention pages")}
          autofocus
          showScope
        />
      </div>

      <div className={classes.suggestionsSection}>
        <div className={classes.suggestionsLabel}>{t("Try these")}</div>
        <div className={classes.suggestionsGrid}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={classes.suggestionCard}
              onClick={() => handleSuggestionClick(s.key)}
            >
              <span className={classes.suggestionIcon}>{s.icon}</span>
              <span className={classes.suggestionText}>{t(s.key)}</span>
              <IconArrowBigRightLines size={14} className={classes.suggestionArrow} />
            </button>
          ))}
        </div>
      </div>

      <div className={classes.emptyStateFooter}>
        <kbd className={classes.kbd}>Shift + Enter</kbd>
        <span className={classes.footerText}>{t("for new line")}</span>
      </div>
    </div>
  );
}
