import { useState } from "react";
import {
  Badge,
  Card,
  Center,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconSearchOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSearchGapsQuery } from "@/features/doc-health/queries/doc-health-query";
import {
  ISearchGap,
  SearchGapCategory,
} from "@/features/doc-health/types/doc-health.types";

const RANGES: { value: string; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function categoryBadge(category: SearchGapCategory) {
  if (category === "no_results") {
    return (
      <Badge variant="light" color="red" size="sm">
        No results
      </Badge>
    );
  }
  return (
    <Badge variant="light" color="orange" size="sm">
      No clicks
    </Badge>
  );
}

function categoryHint(
  category: SearchGapCategory,
  avgResultCount: number,
): string {
  if (category === "no_results") {
    return "Search returned nothing — likely missing content or terminology mismatch.";
  }
  return `Search returned ~${avgResultCount.toFixed(
    1,
  )} results on average but no one clicked — likely wrong content, weak titles, or bad ranking.`;
}

export default function SearchGapsCard() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSearchGapsQuery({ days, limit: 25 });

  const items: ISearchGap[] = data?.items ?? [];

  return (
    <Card withBorder padding="lg" radius="lg">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="xs" align="center">
            <IconSearchOff size={18} />
            <Title order={4}>{t("Search gaps")}</Title>
            {data && (
              <Tooltip
                label={t(
                  "Searches in the last {{days}} days where the user didn't click any result. Scanned {{count}} queries total.",
                  { days: data.rangeDays, count: data.totalQueries },
                )}
              >
                <Badge size="xs" variant="light" color="gray">
                  {t("{{count}} queries", { count: data.totalQueries })}
                </Badge>
              </Tooltip>
            )}
          </Group>
          <SegmentedControl
            size="xs"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            data={RANGES.map((r) => ({ value: r.value, label: t(r.label) }))}
          />
        </Group>
        <Text c="dimmed" size="sm">
          {t(
            "Queries people kept searching but never clicked. Queries with zero results suggest missing content; queries with results but no clicks suggest the right page is hard to recognise.",
          )}
        </Text>

        {isLoading ? (
          <Center h={120}>
            <Text c="dimmed" size="sm">
              {t("Looking for failed searches…")}
            </Text>
          </Center>
        ) : items.length === 0 ? (
          <Center h={120}>
            <Text c="dimmed" size="sm" ta="center" maw={420}>
              {t(
                "No failed searches yet. Once people search and don't click anything, the recurring queries will appear here.",
              )}
            </Text>
          </Center>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Query")}</Table.Th>
                <Table.Th style={{ width: 110 }}>{t("Outcome")}</Table.Th>
                <Table.Th style={{ width: 80 }}>{t("Searched")}</Table.Th>
                <Table.Th style={{ width: 80 }}>{t("Searchers")}</Table.Th>
                <Table.Th style={{ width: 110 }}>{t("Last searched")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((gap) => (
                <Table.Tr key={`${gap.query}-${gap.lastAskedAt}`}>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} title={gap.query}>
                      {gap.query}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip
                      label={t(categoryHint(gap.category, gap.avgResultCount))}
                      withArrow
                      multiline
                      w={260}
                    >
                      <span>{categoryBadge(gap.category)}</span>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue" size="sm">
                      {gap.occurrences}×
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {gap.uniqueAskers}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatRelative(gap.lastAskedAt)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
