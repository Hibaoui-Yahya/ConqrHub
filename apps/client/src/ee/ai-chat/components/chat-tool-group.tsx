import { useState } from "react";
import {
  IconChevronRight,
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { AiChatToolCall } from "../types/ai-chat.types";
import ChatToolResult from "./chat-tool-result";
import { getToolLabel, getToolMainArg } from "../utils/tool-labels";
import classes from "../styles/chat-message.module.css";

type Props = {
  toolCalls: AiChatToolCall[];
  isStreaming?: boolean;
};

export default function ChatToolGroup({ toolCalls, isStreaming }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!toolCalls || toolCalls.length === 0) return null;

  const activeCall =
    isStreaming && toolCalls.length > 0
      ? [...toolCalls].reverse().find((tc) => tc.result === undefined)
      : undefined;

  let activeLabel: string | null = null;
  if (activeCall) {
    const label = getToolLabel(activeCall.name, t);
    const arg = getToolMainArg(activeCall);
    activeLabel = arg ? t("{{label}}: “{{arg}}”", { label, arg }) : label;
  }

  return (
    <div className={classes.toolGroup}>
      <div
        className={classes.toolGroupHeader}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {activeLabel ? (
          <IconLoader2 size={12} className={classes.processingSpinner} />
        ) : expanded ? (
          <IconChevronDown size={12} />
        ) : (
          <IconChevronRight size={12} />
        )}
        <span className={classes.toolGroupLabel}>
          {activeLabel
            ? `${activeLabel}…`
            : t("{{count}} steps", { count: toolCalls.length })}
        </span>
      </div>
      {expanded && (
        <div className={classes.toolGroupSteps}>
          {toolCalls.map((tc) => (
            <ChatToolResult key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}
