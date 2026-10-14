import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Tooltip } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconFileText,
  IconSparkles,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import type { AiChatSource } from "../types/ai-chat.types";
import { sourceLabels } from "../utils/citations";
import classes from "../styles/chat-message.module.css";

/** Sources lists with at most this many entries start expanded. */
const AUTO_EXPAND_MAX = 4;

function fmtDate(iso: string | undefined, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Props = {
  sources?: AiChatSource[];
  confidence?: number | null;
  groundedSourceCount?: number;
  /** Increment to force the list open (e.g. after a citation click). */
  expandRequest?: number;
  /** Citation label to flash after a citation click. */
  highlightLabel?: string | null;
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
  expandRequest = 0,
  highlightLabel,
}: Props) {
  const { t, i18n } = useTranslation();
  const hasSources = !!sources && sources.length > 0;
  const [expanded, setExpanded] = useState(
    hasSources && sources!.length <= AUTO_EXPAND_MAX,
  );

  useEffect(() => {
    if (expandRequest > 0) setExpanded(true);
  }, [expandRequest]);

  const hasConfidence = confidence != null && (groundedSourceCount ?? 0) > 0;

  if (!hasSources && !hasConfidence) return null;

  const count = sources?.length ?? groundedSourceCount ?? 0;
  const bucket = hasConfidence ? confidenceBucket(confidence as number) : null;
  const locale = i18n.language || undefined;

  return (
    <div className={classes.sourcesBlock}>
      <div className={classes.sourcesHeader}>
        {bucket && (
          <Tooltip
            label={t("Confidence: {{percent}}%", {
              percent: Math.round((confidence as number) * 100),
            })}
            withArrow
            openDelay={300}
          >
            <Badge color={bucket.color} variant="light" size="sm" radius="sm">
              {t(bucket.label)}
            </Badge>
          </Tooltip>
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
            const labels = sourceLabels(s);
            const isHighlighted =
              !!highlightLabel && labels.includes(highlightLabel);
            const icon =
              s.kind === "expert_insight" ? (
                <IconSparkles size={13} className={classes.sourceIcon} />
              ) : (
                <IconFileText size={13} className={classes.sourceIcon} />
              );
            const title = s.title || t("Untitled");
            // Deep-link with a relative in-app path (stays on the current host)
            // when we know the page's space + slug; otherwise plain text.
            const linkable = s.kind === "page" && s.spaceSlug && s.slugId;
            const verified = s.verified ?? (!!s.verifiedAt || !!s.verifiedBy);
            const updated = fmtDate(s.updatedAt, locale);
            const hasMeta = s.spaceName || updated;

            return (
              <li
                key={`${s.sourceId}-${labels[0] ?? ""}`}
                className={`${classes.sourceItem} ${isHighlighted ? classes.sourceItemHighlight : ""}`}
              >
                <div className={classes.sourceRow}>
                  {icon}
                  {labels.length > 0 && (
                    <span className={classes.sourceLabels}>
                      {labels.join(" · ")}
                    </span>
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
                  {s.kind === "page" &&
                    (verified ? (
                      <Tooltip
                        label={
                          s.verifiedBy
                            ? `${t("Verified by {{name}}", { name: s.verifiedBy })}${
                                s.verifiedAt ? ` · ${fmtDate(s.verifiedAt, locale)}` : ""
                              }`
                            : t("Verified")
                        }
                        withArrow
                        openDelay={300}
                      >
                        <span className={classes.sourceVerifiedBadge}>
                          <IconCircleCheck size={11} />
                          {t("Verified")}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className={classes.sourceUnverifiedBadge}>
                        {t("Not verified")}
                      </span>
                    ))}
                </div>
                {hasMeta && (
                  <div className={classes.sourceMeta}>
                    {s.spaceName && <span>{s.spaceName}</span>}
                    {updated && (
                      <span>{t("updated {{date}}", { date: updated })}</span>
                    )}
                  </div>
                )}
                {s.excerpt && (
                  <div className={classes.sourceExcerpt}>{s.excerpt}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
