import {
  IconSparkles,
  IconSearch,
  IconFilePlus,
  IconPencil,
  IconFileText,
  IconBulb,
  IconList,
  IconArrowBigRightLines,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import ChatInput from "./chat-input";
import type { ChatAttachment, PageMention } from "../types/ai-chat.types";
import classes from "../styles/ai-chat.module.css";

type Suggestion = {
  icon: React.ReactNode;
  text: string;
  prompt: string;
};

const SUGGESTIONS: Suggestion[] = [
  {
    icon: <IconSearch size={18} />,
    text: "Search across all pages",
    prompt: "Search for pages about ",
  },
  {
    icon: <IconFilePlus size={18} />,
    text: "Create a new page",
    prompt: "Create a new page titled ",
  },
  {
    icon: <IconFileText size={18} />,
    text: "Summarize a page",
    prompt: "Summarize the page @",
  },
  {
    icon: <IconPencil size={18} />,
    text: "Update page content",
    prompt: "Update the page @",
  },
  {
    icon: <IconBulb size={18} />,
    text: "Get page insights",
    prompt: "What are the key insights from @",
  },
  {
    icon: <IconList size={18} />,
    text: "List recent pages",
    prompt: "Show me the most recently updated pages",
  },
];

type Props = {
  isStreaming: boolean;
  onSend: (content: string, mentions: PageMention[], attachments: ChatAttachment[]) => void;
  onStop: () => void;
};

export default function ChatEmptyState({ isStreaming, onSend, onStop }: Props) {
  const { t } = useTranslation();

  const handleSuggestionClick = (prompt: string) => {
    onSend(prompt, [], []);
  };

  return (
    <div className={classes.emptyState}>
      <div className={classes.emptyStateHero}>
        <div className={classes.emptyStateIconWrapper}>
          <IconSparkles size={32} stroke={1.5} className={classes.emptyStateIcon} />
        </div>
        <div className={classes.emptyStateBrand}>{t("Conqrai AI")}</div>
        <div className={classes.emptyStateTitle}>
          {t("How can I help you today?")}
        </div>
        <div className={classes.emptyStateSubtitle}>
          {t("Search pages, create content, or get insights — all in one place.")}
        </div>
      </div>

      <div className={classes.emptyStateInput}>
        <ChatInput
          isStreaming={isStreaming}
          onSend={onSend}
          onStop={onStop}
          placeholder="Ask anything... Use @ to mention pages"
          autofocus
        />
      </div>

      <div className={classes.suggestionsSection}>
        <div className={classes.suggestionsLabel}>Try these</div>
        <div className={classes.suggestionsGrid}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.text}
              type="button"
              className={classes.suggestionCard}
              onClick={() => handleSuggestionClick(s.prompt)}
            >
              <span className={classes.suggestionIcon}>{s.icon}</span>
              <span className={classes.suggestionText}>{s.text}</span>
              <IconArrowBigRightLines size={14} className={classes.suggestionArrow} />
            </button>
          ))}
        </div>
      </div>

      <div className={classes.emptyStateFooter}>
        <kbd className={classes.kbd}>Shift + Enter</kbd>
        <span className={classes.footerText}>for new line</span>
      </div>
    </div>
  );
}
