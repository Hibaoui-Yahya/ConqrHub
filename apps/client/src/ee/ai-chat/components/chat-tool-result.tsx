import { useState } from "react";
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { AiChatToolCall } from "../types/ai-chat.types";
import {
  formatToolDetails,
  getToolLabel,
  getToolMainArg,
} from "../utils/tool-labels";
import classes from "../styles/chat-message.module.css";

type Props = {
  toolCall: AiChatToolCall;
};

export default function ChatToolResult({ toolCall }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const label = getToolLabel(toolCall.name, t);
  const mainArg = getToolMainArg(toolCall);

  return (
    <div className={classes.toolStep}>
      <div
        className={classes.toolStepRow}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className={classes.toolStepBullet}>·</span>
        {expanded ? (
          <IconChevronDown size={12} />
        ) : (
          <IconChevronRight size={12} />
        )}
        <span>
          {mainArg
            ? t("{{label}}: “{{arg}}”", { label, arg: mainArg })
            : label}
        </span>
      </div>
      {expanded && (
        <div className={classes.toolStepDetails}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {formatToolDetails(toolCall)}
          </pre>
        </div>
      )}
    </div>
  );
}
