import { useMemo } from "react";
import { Paper, Text, Group, Stack, Loader, Box, Badge } from "@mantine/core";
import { IconSparkles, IconFileText, IconCircleCheck } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import {
  IAiSearchResponse,
  IAiSearchSource,
} from "../services/ai-search-service.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { markdownToHtml } from "@docmost/editor-ext";
import DOMPurify from "dompurify";
import { useTranslation } from "react-i18next";

interface AiSearchResultProps {
  result?: IAiSearchResponse;
  isLoading?: boolean;
  streamingAnswer?: string;
  streamingSources?: IAiSearchSource[];
}

/** In-app link to a source page; falls back to the slug route when the space is unknown. */
function sourceUrl(source: IAiSearchSource): string {
  if (source.spaceSlug && source.slugId) {
    return buildPageUrl(source.spaceSlug, source.slugId, source.title ?? undefined);
  }
  return `/p/${source.slugId || source.pageId}`;
}

function sourceScore(source: IAiSearchSource): number {
  return source.score ?? source.similarity ?? 0;
}

export function AiSearchResult({
  result,
  isLoading,
  streamingAnswer = "",
  streamingSources = [],
}: AiSearchResultProps) {
  const { t } = useTranslation();

  // Use streaming data if available, otherwise fall back to result
  const answer = streamingAnswer || result?.answer || "";
  const sources: IAiSearchSource[] =
    streamingSources.length > 0 ? streamingSources : result?.sources || [];

  // Deduplicate sources by pageId, keeping the one with the highest score
  const deduplicatedSources = useMemo(() => {
    if (!sources || sources.length === 0) return [];

    const pageMap = new Map<string, IAiSearchSource>();
    sources.forEach((source) => {
      const key = source.pageId || source.slugId || source.title || "";
      const existing = pageMap.get(key);
      if (!existing || sourceScore(source) > sourceScore(existing)) {
        pageMap.set(key, source);
      }
    });

    return Array.from(pageMap.values());
  }, [sources]);

  if (isLoading && !answer) {
    return (
      <Paper p="md" radius="md" withBorder>
        <Group>
          <Loader size="sm" />
          <Text size="sm">{t("AI is thinking...")}</Text>
        </Group>
      </Paper>
    );
  }

  if (!answer && !isLoading) {
    return null;
  }

  return (
    <Stack gap="md" p="md">
      <Paper p="md" radius="md" withBorder>
        <Group gap="xs" mb="sm">
          <IconSparkles size={20} color="var(--brand-default, var(--mantine-color-blue-6))" />
          <Text fw={600} size="sm">
            {t("AI Answer")}
          </Text>
          {isLoading && <Loader size="xs" />}
        </Group>
        <div
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(markdownToHtml(answer) as string),
          }}
        />
      </Paper>

      {deduplicatedSources.length > 0 && (
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed">
            {t("Sources")}
          </Text>
          {deduplicatedSources.map((source) => {
            const verified =
              source.verified ?? (!!source.verifiedAt || !!source.verifiedBy);
            return (
              <Box
                key={source.pageId || source.slugId || source.title || ""}
                component={Link}
                to={sourceUrl(source)}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <Paper
                  p="xs"
                  radius="sm"
                  withBorder
                  style={{ cursor: "pointer" }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <IconFileText size={16} style={{ flexShrink: 0 }} />
                    {source.label && (
                      <Text size="xs" fw={600} c="dimmed" style={{ flexShrink: 0 }}>
                        {source.label}
                      </Text>
                    )}
                    <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
                      {source.title || t("Untitled")}
                    </Text>
                    {source.kind !== "expert_insight" &&
                      (verified ? (
                        <Badge
                          color="teal"
                          variant="light"
                          size="xs"
                          leftSection={<IconCircleCheck size={10} />}
                          style={{ flexShrink: 0 }}
                        >
                          {t("Verified")}
                        </Badge>
                      ) : (
                        <Badge color="gray" variant="light" size="xs" style={{ flexShrink: 0 }}>
                          {t("Not verified")}
                        </Badge>
                      ))}
                  </Group>
                  {(source.spaceName || source.excerpt) && (
                    <Stack gap={2} mt={4} pl={24}>
                      {source.spaceName && (
                        <Text size="xs" c="dimmed">
                          {source.spaceName}
                        </Text>
                      )}
                      {source.excerpt && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {source.excerpt}
                        </Text>
                      )}
                    </Stack>
                  )}
                </Paper>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
