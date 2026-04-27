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
import { IconBulb } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useKnowledgeGapsQuery } from "@/features/doc-health/queries/doc-health-query";

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

export default function KnowledgeGapsCard() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useKnowledgeGapsQuery({ days, limit: 25 });

  const items = data?.items ?? [];

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="xs" align="center">
            <IconBulb size={18} />
            <Title order={4}>{t("Knowledge gaps")}</Title>
            {data && (
              <Tooltip
                label={t(
                  "Recurring questions in chat that suggest a missing or hard-to-find page. Scanned the last {{count}} messages.",
                  { count: data.scannedMessages },
                )}
              >
                <Badge size="xs" variant="light" color="gray">
                  {t("{{count}} scanned", { count: data.scannedMessages })}
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
            "Questions users keep asking the AI assistant. Multiple askers asking the same thing usually means a page is missing or hard to find.",
          )}
        </Text>

        {isLoading ? (
          <Center h={120}>
            <Text c="dimmed" size="sm">
              {t("Looking for recurring questions…")}
            </Text>
          </Center>
        ) : items.length === 0 ? (
          <Center h={120}>
            <Text c="dimmed" size="sm" ta="center" maw={420}>
              {t(
                "No recurring questions yet. Once people ask the AI assistant similar things multiple times, they'll appear here.",
              )}
            </Text>
          </Center>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Question")}</Table.Th>
                <Table.Th style={{ width: 90 }}>{t("Asked")}</Table.Th>
                <Table.Th style={{ width: 90 }}>{t("Askers")}</Table.Th>
                <Table.Th style={{ width: 110 }}>{t("Last asked")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((gap) => (
                <Table.Tr key={`${gap.sampleQuestion}-${gap.lastAskedAt}`}>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} title={gap.sampleQuestion}>
                      {gap.sampleQuestion}
                    </Text>
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
