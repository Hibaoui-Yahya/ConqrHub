import {
  Card,
  Group,
  Progress,
  RingProgress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IHealthScore,
  ISignalBreakdown,
} from "@/features/doc-health/types/doc-health.types";

const SIGNAL_LABELS: Record<keyof ISignalBreakdown, string> = {
  freshness: "Freshness",
  ownership: "Ownership",
  verification: "Verification",
  contentStrength: "Content strength",
  searchSuccess: "Search success",
};

function scoreColor(score: number) {
  if (score >= 80) return "teal";
  if (score >= 60) return "yellow";
  if (score >= 40) return "orange";
  return "red";
}

interface Props {
  data: IHealthScore | undefined;
  isLoading: boolean;
  title?: string;
  subtitle?: string;
}

export default function HealthScoreCard({
  data,
  isLoading,
  title,
  subtitle,
}: Props) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card withBorder padding="lg" radius="lg">
        <Text c="dimmed">{t("Loading score…")}</Text>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card withBorder padding="lg" radius="lg">
        <Text c="dimmed">{t("No data available.")}</Text>
      </Card>
    );
  }

  const score = data.score ?? 0;
  const color = scoreColor(score);

  return (
    <Card withBorder padding="lg" radius="lg">
      <Group align="flex-start" gap="xl" wrap="nowrap">
        <Stack gap="xs" align="center">
          {data.insufficientData ? (
            <RingProgress
              size={140}
              thickness={12}
              sections={[{ value: 0, color: "gray" }]}
              label={
                <Text size="sm" c="dimmed" ta="center">
                  {t("N/A")}
                </Text>
              }
            />
          ) : (
            <RingProgress
              size={140}
              thickness={12}
              sections={[{ value: score, color }]}
              label={
                <Text size="xl" fw={700} ta="center">
                  {score}
                </Text>
              }
            />
          )}
          <Text size="sm" c="dimmed">
            {t("of 100")}
          </Text>
        </Stack>

        <Stack gap="sm" style={{ flex: 1 }}>
          <Stack gap={4}>
            <Title order={4}>{title ?? t("Health score")}</Title>
            <Text size="sm" c="dimmed">
              {subtitle ??
                t("{{count}} pages scored", {
                  count: data.scoredPageCount,
                })}
            </Text>
            {data.insufficientData && (
              <Text size="sm" c="dimmed" fs="italic">
                {t(
                  "Add at least 10 pages to see a score for this scope.",
                )}
              </Text>
            )}
          </Stack>

          {!data.insufficientData &&
            (Object.keys(SIGNAL_LABELS) as (keyof ISignalBreakdown)[])
              .filter((key) => data.signals[key] !== undefined)
              .map((key) => {
                const value = data.signals[key];
                const isApplicable = value !== null && value !== undefined;
                return (
                  <Stack key={key} gap={2}>
                    <Group justify="space-between">
                      <Text size="sm">{t(SIGNAL_LABELS[key])}</Text>
                      <Text size="sm" fw={500} c={isApplicable ? undefined : "dimmed"}>
                        {isApplicable ? value : t("Not applicable")}
                      </Text>
                    </Group>
                    <Progress
                      value={isApplicable ? (value as number) : 0}
                      color={isApplicable ? scoreColor(value as number) : "gray"}
                      size="sm"
                    />
                  </Stack>
                );
              })}
        </Stack>
      </Group>
    </Card>
  );
}
