import { useRef } from "react";
import { Link } from "react-router-dom";
import { useAtomValue } from "jotai";
import { Button } from "@mantine/core";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
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
  IconDatabaseExclamation,
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
  /** Short category shown above the prompt. */
  tag: string;
  /** i18n key; the English text doubles as the prompt sent/inserted. */
  key: string;
};

// Knowledge-work prompts that make sense for an HR agency and for any wiki.
// Prompts ending with "@" or "…" are inserted into the composer for the user
// to complete; the others are sent immediately.
const SUGGESTIONS: Suggestion[] = [
  {
    icon: <IconSearch size={18} />,
    tag: "Search",
    key: "What do our interview guides say about …",
  },
  {
    icon: <IconFileText size={18} />,
    tag: "Reading",
    key: "Summarize the page @",
  },
  {
    icon: <IconShieldCheck size={18} />,
    tag: "Knowledge base",
    key: "Which pages are not verified yet?",
  },
  {
    icon: <IconReport size={18} />,
    tag: "Writing",
    key: "Write a report from @",
  },
  {
    icon: <IconArrowsLeftRight size={18} />,
    tag: "Analysis",
    key: "Compare @ and @",
  },
  {
    icon: <IconClockEdit size={18} />,
    tag: "Activity",
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
  const user = useAtomValue(userAtom);
  const firstName = (user?.name ?? "").trim().split(/\s+/)[0];

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
  // Nothing verified yet: the assistant can only quote raw pages, so say so
  // up front and offer the one action that fixes it.
  const knowledgeBaseEmpty =
    showKbStatus && (overview.verified ?? 0) + (overview.expiring ?? 0) === 0;

  return (
    <div className={classes.emptyState}>
      <div className={classes.emptyStateHero}>
        <div className={classes.emptyStateIconWrapper}>
          <IconSparkles size={32} stroke={1.5} className={classes.emptyStateIcon} />
        </div>
        <div className={classes.emptyStateBrand} aria-label="ConqrAI">
          <span>Conqr</span>
          <span className={classes.emptyStateBrandAccent}>AI</span>
        </div>
        <div className={classes.emptyStateTitle}>
          {firstName
            ? t("Hello {{name}}, what are you looking for?", { name: firstName })
            : t("How can I help you today?")}
        </div>
        <div className={classes.emptyStateSubtitle}>
          {t("I answer from the verified pages of your spaces and cite every source.")}
        </div>
        {showKbStatus && !knowledgeBaseEmpty && (
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

      {knowledgeBaseEmpty && (
        <div className={classes.kbAlert} role="status">
          <span className={classes.kbAlertIcon}>
            <IconDatabaseExclamation size={18} />
          </span>
          <div className={classes.kbAlertText}>
            <div className={classes.kbAlertTitle}>
              {t("The knowledge base is empty")}
            </div>
            <div className={classes.kbAlertBody}>
              {t(
                "{{unverified}} pages to verify. Until pages are verified, I read raw pages and mark every answer as unverified.",
                { unverified: overview.unverified ?? 0 },
              )}
            </div>
          </div>
          <Button
            component={Link}
            to="/settings/knowledge-base"
            size="xs"
            className={classes.kbAlertButton}
          >
            {t("Verify pages")}
          </Button>
        </div>
      )}

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
              <span className={classes.suggestionBody}>
                <span className={classes.suggestionTag}>{t(s.tag)}</span>
                <span className={classes.suggestionText}>{t(s.key)}</span>
              </span>
              <IconArrowBigRightLines size={14} className={classes.suggestionArrow} />
            </button>
          ))}
        </div>
      </div>

      <div className={classes.emptyStateFooter}>
        <kbd className={classes.kbd}>{t("Shift + Enter")}</kbd>
        <span className={classes.footerText}>{t("for new line")}</span>
      </div>
    </div>
  );
}
