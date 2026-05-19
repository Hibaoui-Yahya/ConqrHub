import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconPlayerStopFilled,
  IconMicrophone,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  isSystemAudioSupported,
  useMeetingRecorder,
} from "../hooks/use-meeting-recorder";

function formatStamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function MeetingRecorder() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [captureSystem, setCaptureSystem] = useState(true);
  const [consent, setConsent] = useState(false);

  const sysSupported = useMemo(() => isSystemAudioSupported(), []);

  const { state, elapsedMs, start, stop, cancel } = useMeetingRecorder({
    captureSystem,
    title: title.trim() || undefined,
    onError: (err) =>
      notifications.show({
        color: "red",
        title: t("Recording error"),
        message: err.message,
      }),
    onCompleted: (id) => {
      notifications.show({
        color: "teal",
        title: t("Meeting saved"),
        message: t("Transcript is ready."),
      });
      navigate(`/meetings/${id}`);
    },
    onCancelled: () => {
      notifications.show({
        color: "gray",
        message: t("Recording cancelled. Nothing was saved."),
      });
    },
  });

  const onStart = useCallback(() => {
    if (!consent) {
      notifications.show({
        color: "yellow",
        message: t("Please confirm recording consent first."),
      });
      return;
    }
    void start();
  }, [consent, start, t]);

  const onCancelClick = useCallback(() => {
    modals.openConfirmModal({
      title: t("Discard recording?"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "This will stop recording and delete everything captured so far. The transcript will not be saved.",
          )}
        </Text>
      ),
      labels: { confirm: t("Discard"), cancel: t("Keep recording") },
      confirmProps: { color: "red" },
      onConfirm: () => void cancel(),
    });
  }, [cancel, t]);

  const isRecording = state === "recording";
  const isUploading = state === "uploading";
  const isBusy =
    state === "requesting" || state === "uploading" || state === "recording";

  return (
    <Paper p="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="lg" fw={600}>
              {t("New meeting")}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "Records your mic and (optionally) the meeting tab's audio. The full transcript is generated when you stop the recording.",
              )}
            </Text>
          </div>
          {isRecording && (
            <Group gap="xs">
              <ThemeIcon
                color="red"
                variant="filled"
                radius="xl"
                size="sm"
                style={{ animation: "pulse 1s infinite" }}
              >
                <IconMicrophone size={12} />
              </ThemeIcon>
              <Text size="sm" fw={600}>
                {formatStamp(elapsedMs)}
              </Text>
            </Group>
          )}
        </Group>

        <TextInput
          label={t("Title (optional)")}
          placeholder={t("e.g. Weekly product sync")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          disabled={isBusy}
        />

        <Checkbox
          label={t("Capture system / meeting tab audio")}
          description={
            sysSupported
              ? t(
                  "You will be asked to choose a tab or screen. Tick 'Share tab audio'.",
                )
              : t("Your browser does not support system audio capture.")
          }
          checked={captureSystem && sysSupported}
          disabled={!sysSupported || isBusy}
          onChange={(e) => setCaptureSystem(e.currentTarget.checked)}
        />

        <Alert
          icon={<IconAlertCircle size={16} />}
          color="yellow"
          variant="light"
        >
          <Text size="sm">
            {t(
              "Recording calls may require all-party consent in your jurisdiction. Tell every participant before you start.",
            )}
          </Text>
          <Checkbox
            mt="xs"
            size="xs"
            label={t(
              "I confirm all meeting participants have been informed and agree to be recorded.",
            )}
            checked={consent}
            onChange={(e) => setConsent(e.currentTarget.checked)}
            disabled={isBusy}
          />
        </Alert>

        {isUploading && (
          <Alert color="blue" variant="light" icon={<Loader size="xs" />}>
            <Text size="sm">
              {t(
                "Uploading audio and transcribing… This can take 30-90 seconds for a typical meeting. Do not close this tab.",
              )}
            </Text>
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          {!isRecording && !isUploading && (
            <Button
              onClick={onStart}
              disabled={!consent || isBusy}
              leftSection={<IconMicrophone size={16} />}
              color="red"
            >
              {state === "requesting"
                ? t("Starting…")
                : t("Start recording")}
            </Button>
          )}
          {isRecording && (
            <>
              <Button
                variant="default"
                onClick={onCancelClick}
                leftSection={<IconX size={16} />}
              >
                {t("Cancel")}
              </Button>
              <Button
                onClick={() => void stop()}
                leftSection={<IconPlayerStopFilled size={16} />}
                color="red"
                variant="filled"
              >
                {t("Stop & transcribe")}
              </Button>
            </>
          )}
          {isUploading && (
            <Button
              color="blue"
              disabled
              leftSection={<Loader size="xs" color="white" />}
            >
              {t("Transcribing…")}
            </Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
