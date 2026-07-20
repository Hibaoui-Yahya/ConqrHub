import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Timeline,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconArrowRight,
  IconRefresh,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { processMeeting } from "../services/meeting-service";
import {
  isMeetingProcessing,
  MEETING_TYPE_OPTIONS,
} from "../types/meeting.types";
import type { MeetingStatusResponse } from "../types/meeting.types";

export function meetingStatusColor(status: string): string {
  if (status === "completed" || status === "published") return "teal";
  if (status === "failed" || status === "partially_failed") return "red";
  if (status === "recording") return "red";
  if (status === "awaiting_review" || status === "speakers_pending_review")
    return "yellow";
  if (isMeetingProcessing(status)) return "blue";
  return "gray";
}

function typeSourceLabel(source: string | null): string {
  switch (source) {
    case "user":
      return "set by you";
    case "detected":
      return "detected";
    case "default":
      return "default";
    default:
      return source ?? "";
  }
}

interface MeetingStatusPanelProps {
  meetingId: string;
  statusInfo: MeetingStatusResponse;
  onProcessKicked: () => void;
}

export function MeetingStatusPanel({
  meetingId,
  statusInfo,
  onProcessKicked,
}: MeetingStatusPanelProps) {
  const { t } = useTranslation();
  const [retrying, setRetrying] = useState(false);
  const [changingType, setChangingType] = useState(false);

  const status = statusInfo.status;
  const isFailedState = status === "failed" || status === "partially_failed";
  const transitions = (statusInfo.events ?? []).filter(
    (e) => e.event === "transition",
  );
  const audioSeconds = statusInfo.cost?.["audioSeconds"];

  const retryProcessing = async () => {
    setRetrying(true);
    try {
      await processMeeting(meetingId);
      notifications.show({
        color: "teal",
        message: t("Processing restarted."),
      });
      onProcessKicked();
    } catch (err: any) {
      notifications.show({
        color: "red",
        message:
          err?.response?.data?.message ?? t("Failed to restart processing"),
      });
    } finally {
      setRetrying(false);
    }
  };

  const changeMeetingType = (nextType: string | null) => {
    if (!nextType || nextType === statusInfo.meetingType) return;
    const label =
      MEETING_TYPE_OPTIONS.find((o) => o.value === nextType)?.label ?? nextType;
    modals.openConfirmModal({
      title: t("Change meeting type?"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Changing the type to '{{label}}' will re-run the AI analysis with the new template. Generated documents and pending action proposals will be replaced. The transcript is kept — no re-transcription happens.",
            { label: t(label) },
          )}
        </Text>
      ),
      labels: { confirm: t("Re-analyze"), cancel: t("Cancel") },
      onConfirm: async () => {
        setChangingType(true);
        try {
          await processMeeting(meetingId, { meetingType: nextType });
          notifications.show({
            color: "teal",
            message: t("Re-analysis started with the new meeting type."),
          });
          onProcessKicked();
        } catch (err: any) {
          notifications.show({
            color: "red",
            message:
              err?.response?.data?.message ??
              t("Failed to change meeting type"),
          });
        } finally {
          setChangingType(false);
        }
      },
    });
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {t("Processing status")}
            </Text>
            <Badge color={meetingStatusColor(status)}>{t(status)}</Badge>
            {isMeetingProcessing(status) && (
              <Text size="xs" c="dimmed">
                {t("Updating automatically…")}
              </Text>
            )}
          </Group>
          {typeof audioSeconds === "number" && (
            <Text size="xs" c="dimmed">
              {t("{{minutes}} min of audio processed", {
                minutes: Math.round(audioSeconds / 60),
              })}
            </Text>
          )}
        </Group>

        {isFailedState && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
            title={
              status === "partially_failed"
                ? t("Processing partially failed")
                : t("Processing failed")
            }
          >
            <Stack gap="xs">
              <Text size="sm">
                {statusInfo.failureReason ??
                  t("An unknown error occurred during processing.")}
              </Text>
              <Group>
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  loading={retrying}
                  onClick={() => void retryProcessing()}
                >
                  {t("Retry processing")}
                </Button>
              </Group>
            </Stack>
          </Alert>
        )}

        <Group gap="sm" align="flex-end">
          <Select
            label={t("Meeting type")}
            description={
              statusInfo.meetingTypeSource
                ? `${t(typeSourceLabel(statusInfo.meetingTypeSource))}${
                    statusInfo.meetingTypeConfidence != null
                      ? ` · ${Math.round(statusInfo.meetingTypeConfidence * 100)}%`
                      : ""
                  }`
                : undefined
            }
            data={MEETING_TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: t(o.label),
            }))}
            value={statusInfo.meetingType}
            onChange={changeMeetingType}
            disabled={changingType || isMeetingProcessing(status)}
            allowDeselect={false}
            w={260}
          />
          <Text size="xs" c="dimmed" pb={8}>
            {t(
              "Correcting the type re-runs the analysis on the existing transcript.",
            )}
          </Text>
        </Group>

        {transitions.length > 0 && (
          <Timeline
            active={transitions.length - 1}
            bulletSize={16}
            lineWidth={2}
            mt="xs"
          >
            {transitions.map((e, idx) => (
              <Timeline.Item
                key={`${e.createdAt}-${idx}`}
                bullet={<IconArrowRight size={10} />}
                title={
                  <Text size="sm" fw={500}>
                    {t(e.toStatus ?? "")}
                  </Text>
                }
              >
                <Text size="xs" c="dimmed">
                  {new Date(e.createdAt).toLocaleString()}
                  {e.fromStatus ? ` · ${t("from")} ${t(e.fromStatus)}` : ""}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        )}
      </Stack>
    </Paper>
  );
}
