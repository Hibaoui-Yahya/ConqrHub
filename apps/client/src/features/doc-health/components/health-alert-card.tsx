import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconBell, IconBellOff, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useHealthAlertsQuery,
  useSubscribeHealthAlertMutation,
  useUnsubscribeHealthAlertMutation,
} from "@/features/doc-health/queries/doc-health-query";

const DEFAULT_THRESHOLD = 60;

export default function HealthAlertCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useHealthAlertsQuery();
  const subscribe = useSubscribeHealthAlertMutation();
  const unsubscribe = useUnsubscribeHealthAlertMutation();

  // Workspace-level subscription = the row with spaceId === null. Surface it
  // as a single Switch + NumberInput so the most common case is one tap.
  const workspaceSub = data?.items.find((it) => it.spaceId === null);
  const enabled = Boolean(workspaceSub);
  const [draftThreshold, setDraftThreshold] = useState<number>(
    workspaceSub?.threshold ?? DEFAULT_THRESHOLD,
  );

  useEffect(() => {
    if (workspaceSub) setDraftThreshold(workspaceSub.threshold);
  }, [workspaceSub?.id, workspaceSub?.threshold]);

  const onToggle = (next: boolean) => {
    if (next) {
      subscribe.mutate({ threshold: draftThreshold });
    } else if (workspaceSub) {
      unsubscribe.mutate(workspaceSub.id);
    }
  };

  const onCommitThreshold = () => {
    if (!enabled) return;
    if (draftThreshold === workspaceSub?.threshold) return;
    subscribe.mutate({ threshold: draftThreshold });
  };

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            {enabled ? (
              <IconBell size={18} stroke={1.6} />
            ) : (
              <IconBellOff size={18} stroke={1.6} />
            )}
            <Text fw={500}>{t("Alert me when score drops")}</Text>
            {enabled && (
              <Badge size="sm" variant="light">
                {t("Active")}
              </Badge>
            )}
          </Group>
          <Switch
            checked={enabled}
            disabled={isLoading || subscribe.isPending || unsubscribe.isPending}
            onChange={(e) => onToggle(e.currentTarget.checked)}
            aria-label={t("Toggle health alert")}
          />
        </Group>

        <Group gap="md" align="flex-end" wrap="wrap">
          <NumberInput
            label={t("Threshold")}
            description={t(
              "Notify when the workspace score falls below this value. We send at most one alert per 24 hours.",
            )}
            min={0}
            max={100}
            disabled={!enabled}
            value={draftThreshold}
            onChange={(v) =>
              setDraftThreshold(typeof v === "number" ? v : Number(v) || 0)
            }
            onBlur={onCommitThreshold}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitThreshold();
            }}
            w={200}
          />
          {enabled && workspaceSub?.lastFiredAt && (
            <Tooltip label={new Date(workspaceSub.lastFiredAt).toLocaleString()}>
              <Text size="xs" c="dimmed">
                {t("Last fired {{when}}", {
                  when: new Date(workspaceSub.lastFiredAt).toLocaleDateString(),
                })}
              </Text>
            </Tooltip>
          )}
          {enabled && workspaceSub && (
            <Tooltip label={t("Remove alert")}>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => unsubscribe.mutate(workspaceSub.id)}
                disabled={unsubscribe.isPending}
                aria-label={t("Remove alert")}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
