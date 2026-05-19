import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconTrash, IconEye } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { getAppName } from "@/lib/config";
import { MeetingRecorder } from "../components/meeting-recorder";
import {
  deleteMeeting,
  listMeetings,
} from "../services/meeting-service";
import type { Meeting } from "../types/meeting.types";

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MeetingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listMeetings({ limit: 50 });
      setItems(res.items);
    } catch (err: any) {
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to load meetings"),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onDelete = (id: string, title: string) => {
    modals.openConfirmModal({
      title: t("Delete meeting"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to delete '{{title}}'? The transcript and any AI outputs will be removed. This cannot be undone.",
            { title },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteMeeting(id);
          setItems((prev) => prev.filter((m) => m.id !== id));
          notifications.show({ color: "teal", message: t("Meeting deleted") });
        } catch (err: any) {
          notifications.show({
            color: "red",
            message: err?.response?.data?.message ?? t("Failed to delete"),
          });
        }
      },
    });
  };

  return (
    <>
      <Helmet>
        <title>
          {t("Meetings")} - {getAppName()}
        </title>
      </Helmet>
      <Stack gap="lg" p="md">
        <Title order={2}>{t("Meetings")}</Title>

        <MeetingRecorder />

        <Paper p="md" withBorder>
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={600}>
              {t("Past meetings")}
            </Text>
            {loading && <Loader size="xs" />}
          </Group>

          {!loading && items.length === 0 && (
            <Text size="sm" c="dimmed">
              {t("No meetings yet. Start your first recording above.")}
            </Text>
          )}

          {items.length > 0 && (
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Title")}</Table.Th>
                  <Table.Th>{t("Started")}</Table.Th>
                  <Table.Th>{t("Duration")}</Table.Th>
                  <Table.Th>{t("Status")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td>{m.title}</Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {new Date(m.startedAt).toLocaleString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>{formatDuration(m.durationMs)}</Table.Td>
                    <Table.Td>
                      <Badge
                        size="sm"
                        color={
                          m.status === "completed"
                            ? "teal"
                            : m.status === "recording"
                              ? "red"
                              : m.status === "failed"
                                ? "red"
                                : "gray"
                        }
                      >
                        {t(m.status)}
                      </Badge>
                    </Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      <Group gap="xs" justify="flex-end">
                        <Tooltip label={t("Open")}>
                          <ActionIcon
                            variant="subtle"
                            onClick={() => navigate(`/meetings/${m.id}`)}
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t("Delete")}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => onDelete(m.id, m.title)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Paper>
      </Stack>
    </>
  );
}
