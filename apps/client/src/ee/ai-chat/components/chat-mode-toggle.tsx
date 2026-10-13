/* eslint-disable react-refresh/only-export-components */
import { Tooltip, UnstyledButton } from "@mantine/core";
import { IconBolt, IconTelescope } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { AiChatMode } from "../types/ai-chat.types";
import classes from "../styles/chat-input.module.css";

const STORAGE_KEY = "conqr.askAi.mode";

/** Last mode the person used, remembered on this device only. */
export function readStoredMode(): AiChatMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "deep" ? "deep" : "fast";
  } catch {
    return "fast";
  }
}

export function storeMode(mode: AiChatMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage blocked (private window): the choice simply is not remembered.
  }
}

type Props = {
  value: AiChatMode;
  onChange: (mode: AiChatMode) => void;
};

/**
 * Fast answers from the best passages, or a deep search that reads more
 * pages before answering. Rendered as a two-option segmented control.
 */
export default function ChatModeToggle({ value, onChange }: Props) {
  const { t } = useTranslation();
  const options: Array<{
    mode: AiChatMode;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }> = [
    {
      mode: "fast",
      label: t("Fast"),
      hint: t("Answers from the most relevant passages."),
      icon: <IconBolt size={13} />,
    },
    {
      mode: "deep",
      label: t("Deep"),
      hint: t("Reads more pages and compares them before answering. Slower."),
      icon: <IconTelescope size={13} />,
    },
  ];

  return (
    <div className={classes.modeToggle} role="radiogroup" aria-label={t("Answer mode")}>
      {options.map((o) => (
        <Tooltip key={o.mode} label={o.hint} openDelay={400} withArrow>
          <UnstyledButton
            role="radio"
            aria-checked={value === o.mode}
            data-active={value === o.mode || undefined}
            className={classes.modeOption}
            onClick={() => onChange(o.mode)}
          >
            {o.icon}
            <span>{o.label}</span>
          </UnstyledButton>
        </Tooltip>
      ))}
    </div>
  );
}
