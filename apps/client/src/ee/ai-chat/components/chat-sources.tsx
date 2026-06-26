import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconSparkles,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/features/page/page.utils.ts";
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
          {sources!.map((s) => {
            const icon =
              s.kind === "expert_insight" ? (
                <IconSparkles size={13} className={classes.sourceIcon} />
              ) : (
                <IconFileText size={13} className={classes.sourceIcon} />
              );
            const title = s.title || t("Untitled");
            const score = (
              <span className={classes.sourceScore}>
                {Math.round(s.score * 100)}%
              </span>
            );
            // Deep-link with a relative in-app path (stays on the current host)
            // when we know the page's space + slug; otherwise plain text.
            const linkable =
              s.kind === "page" && s.spaceSlug && s.slugId;
            return (
              <li key={s.sourceId} className={classes.sourceItem}>
                {icon}
                {s.label && (
                  <span className={classes.sourceLabel}>{s.label}</span>
                )}
                {linkable ? (
                  <Link
                    to={buildPageUrl(s.spaceSlug!, s.slugId!, s.title ?? undefined)}
                    className={classes.sourceTitleLink}
                  >
                    {title}
                  </Link>
                ) : (
                  <span className={classes.sourceTitle}>{title}</span>
                )}
                {score}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
