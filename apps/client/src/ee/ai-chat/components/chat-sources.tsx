import { useState } from "react";
import { Badge } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconSparkles,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { AiChatSource } from "../types/ai-chat.types";
import classes from "../styles/chat-message.module.css";

type Props = {
  sources?: AiChatSource[];
  confidence?: number | null;
  groundedSourceCount?: number;
};

// Maps a 0–1 confidence into a labelled, colour-coded bucket. Tuned so that
// "High" requires genuinely strong cosine similarity across the grounding.
function confidenceBucket(c: number): { label: string; color: string } {
  if (c >= 0.7) return { label: "High confidence", color: "green" };
  if (c >= 0.4) return { label: "Medium confidence", color: "yellow" };
  return { label: "Low confidence", color: "gray" };
}

export default function ChatSources({
  sources,
  confidence,
  groundedSourceCount,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const hasSources = !!sources && sources.length > 0;
  const hasConfidence = confidence != null && (groundedSourceCount ?? 0) > 0;

  if (!hasSources && !hasConfidence) return null;

  const count = groundedSourceCount ?? sources?.length ?? 0;
  const bucket = hasConfidence ? confidenceBucket(confidence as number) : null;

  return (
    <div className={classes.sourcesBlock}>
      <div className={classes.sourcesHeader}>
        {bucket && (
          <Badge color={bucket.color} variant="light" size="sm" radius="sm">
            {t(bucket.label)}
            {confidence != null ? ` · ${Math.round(confidence * 100)}%` : ""}
          </Badge>
        )}
        {hasSources && (
          <button
            type="button"
            className={classes.sourcesToggle}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? (
              <IconChevronDown size={13} />
            ) : (
              <IconChevronRight size={13} />
            )}
            {t("{{count}} source", { count })}
          </button>
        )}
      </div>

      {hasSources && expanded && (
        <ul className={classes.sourcesList}>
          {sources!.map((s) => (
            <li key={s.sourceId} className={classes.sourceItem}>
              {s.kind === "expert_insight" ? (
                <IconSparkles size={13} className={classes.sourceIcon} />
              ) : (
                <IconFileText size={13} className={classes.sourceIcon} />
              )}
              {s.label && <span className={classes.sourceLabel}>{s.label}</span>}
              <span className={classes.sourceTitle}>
                {s.title || t("Untitled")}
              </span>
              <span className={classes.sourceScore}>
                {Math.round(s.score * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
