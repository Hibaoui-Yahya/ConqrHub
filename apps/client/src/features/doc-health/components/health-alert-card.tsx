import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconBell, IconBellOff } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useHealthAlertsQuery,
  useSubscribeHealthAlertMutation,
  useUnsubscribeHealthAlertMutation,
  useWorkspaceHealthQuery,
} from "@/features/doc-health/queries/doc-health-query";
import {
  IHealthAlert,
  ISpaceScoreSummary,
} from "@/features/doc-health/types/doc-health.types";

const WORKSPACE_SCOPE = "__workspace__";

export default function HealthAlertCard() {
  const { t } = useTranslation();
  const { data, isLoading } = useHealthAlertsQuery();
  const { data: workspaceHealth } = useWorkspaceHealthQuery();
  const spaces: ISpaceScoreSummary[] = workspaceHealth?.spaces ?? [];
  const subscribe = useSubscribeHealthAlertMutation();
  const unsubscribe = useUnsubscribeHealthAlertMutation();

  const [scope, setScope] = useState<string>(WORKSPACE_SCOPE);
  const [threshold, setThreshold] = useState<number | string>(70);

  const items = data?.items ?? [];
  const spacesById = useMemo(() => {
    const map = new Map<string, ISpaceScoreSummary>();
    for (const s of spaces) map.set(s.spaceId, s);
    return map;
  }, [spaces]);

  const scopeLabel = (alert: IHealthAlert) => {
    if (!alert.spaceId) return t("Workspace");
    const s = spacesById.get(alert.spaceId);
    return s?.spaceName ?? s?.spaceSlug ?? t("Space");
  };

  const handleSubmit = () => {
    const t1 = typeof threshold === "number" ? threshold : Number(threshold);
    if (!Number.isFinite(t1) || t1 < 0 || t1 > 100) return;
    subscribe.mutate({
      threshold: t1,
      spaceId: scope === WORKSPACE_SCOPE ? undefined : scope,
    });
  };

  return (
    <Card withBorder padding="lg" radius="lg">
      <Stack gap="md">
        <Group gap="xs" align="center">
          <IconBell size={18} />
          <Title order={4}>{t("Score alerts")}</Title>
        </Group>
        <Text c="dimmed" size="sm">
          {t(
            "Get an in-app notification when the workspace or a space's score drops below your threshold. Re-fires at most once every 24 hours per scope.",
          )}
        </Text>

        <Group gap="sm" align="end" wrap="wrap">
          <Select
            label={t("Scope")}
            data={[
              { value: WORKSPACE_SCOPE, label: t("Workspace") },
              ...spaces.map((s) => ({
                value: s.spaceId,
                label: s.spaceName ?? s.spaceSlug,
              })),
            ]}
            value={scope}
            onChange={(v) => v && setScope(v)}
            w={200}
            comboboxProps={{ withinPortal: false }}
          />
          <NumberInput
            label={t("Threshold")}
            value={threshold}
            onChange={(v) => setThreshold(v)}
            min={0}
            max={100}
            step={5}
            w={120}
            suffix=" / 100"
          />
          <Button
            onClick={handleSubmit}
            loading={subscribe.isPending}
            disabled={
              !Number.isFinite(
                typeof threshold === "number" ? threshold : Number(threshold),
              )
            }
          >
            {t("Subscribe")}
          </Button>
        </Group>

        {isLoading ? (
          <Text c="dimmed" size="sm">
            {t("Loading…")}
          </Text>
        ) : items.length === 0 ? (
          <Text c="dimmed" size="sm">
            {t("No alerts yet — subscribe above to get notified when a score drops.")}
          </Text>
        ) : (
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Scope")}</Table.Th>
                <Table.Th>{t("Threshold")}</Table.Th>
                <Table.Th>{t("Last fired")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((alert) => (
                <Table.Tr key={alert.id}>
                  <Table.Td>
                    <Group gap={6}>
                      <Text fw={500} size="sm">
                        {scopeLabel(alert)}
                      </Text>
                      {!alert.spaceId && (
                        <Badge size="xs" variant="light">
                          {t("Workspace")}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{alert.threshold} / 100</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {alert.lastFiredAt
                        ? new Date(alert.lastFiredAt).toLocaleString()
                        : t("Never")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end">
                      <Tooltip label={t("Remove alert")}>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => unsubscribe.mutate(alert.id)}
                          loading={
                            unsubscribe.isPending &&
                            unsubscribe.variables === alert.id
                          }
                          aria-label={t("Remove alert")}
                        >
                          <IconBellOff size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
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
