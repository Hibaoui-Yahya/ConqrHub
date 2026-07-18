import { useQuery } from "@tanstack/react-query";
import { Anchor, Badge, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconArrowsExchange } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  getRecentSuiteNotifications,
  resolveSmartObjects,
} from "@/features/integration/services/integration-service";
import type { PresentationModel } from "@/features/integration/types/integration.types";

// Outcome → user-facing label (one notification per action chain, §5.3C).
const OUTCOME_LABELS: Record<string, string> = {
  linked: "Work item linked",
  unlinked: "Link removed",
  "mapping-changed": "Docs mapping changed",
  "work-updated": "Linked work updated",
  "work-deleted": "Linked work deleted",
};

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Cross-product "Suite" feed in the notification bell (blueprint §5.3C):
 * deduplicated outcomes (one row per action chain, never one per raw event),
 * each deep-linking into the owning product with its context preserved.
 */
export function SuiteNotificationList({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();

  const { data: items, isLoading } = useQuery({
    queryKey: ["suite-notifications"],
    queryFn: () => getRecentSuiteNotifications(20),
    refetchOnWindowFocus: false,
  });

  const subjects = [...new Set((items ?? []).map((i) => i.subject))];
  const { data: resolutions } = useQuery({
    queryKey: ["suite-notification-subjects", subjects],
    queryFn: () => resolveSmartObjects({ urns: subjects }),
    enabled: subjects.length > 0,
  });
  const modelByUrn = new Map<string, PresentationModel>(
    (resolutions ?? []).map((m) => [m.urn, m]),
  );

  if (isLoading) {
    return (
      <Stack gap="xs" p="md">
        <Skeleton height={38} radius="sm" />
        <Skeleton height={38} radius="sm" />
        <Skeleton height={38} radius="sm" />
      </Stack>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        {t("No cross-product activity yet")}
      </Text>
    );
  }

  return (
    <Stack gap={0}>
      {items.map((item) => {
        const model = modelByUrn.get(item.subject);
        const title = model?.title ?? item.subject;
        const row = (
          <Group gap="sm" px="md" py="sm" wrap="nowrap">
            <IconArrowsExchange size={18} stroke={1.5} />
            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
              <Group gap={6} wrap="nowrap">
                <Text size="sm" fw={500} truncate>
                  {t(OUTCOME_LABELS[item.outcome] ?? item.outcome)}
                </Text>
                {item.collapsedEventCount > 1 && (
                  <Badge size="xs" variant="light">
                    {item.collapsedEventCount}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" truncate>
                {title}
              </Text>
            </Stack>
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              {timeAgo(item.at)}
            </Text>
          </Group>
        );
        return model?.deepLink ? (
          <Anchor
            key={item.correlationId}
            href={model.deepLink}
            target={model.deepLink.startsWith("http") ? "_blank" : undefined}
            underline="never"
            c="inherit"
            onClick={() => onNavigate?.()}
          >
            {row}
          </Anchor>
        ) : (
          <div key={item.correlationId}>{row}</div>
        );
      })}
    </Stack>
  );
}
