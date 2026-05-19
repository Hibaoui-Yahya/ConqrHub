import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconPlayerStopFilled,
  IconMicrophone,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  isSystemAudioSupported,
  useMeetingRecorder,
} from "../hooks/use-meeting-recorder";
import type { MeetingSource } from "../types/meeting.types";

interface LiveLine {
  source: MeetingSource;
  text: string;
  startMs: number;
  sequence: number;
}

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
  const [lines, setLines] = useState<LiveLine[]>([]);

  const sysSupported = useMemo(() => isSystemAudioSupported(), []);

  const { state, elapsedMs, start, stop, cancel } = useMeetingRecorder({
    captureSystem,
    title: title.trim() || undefined,
    onChunk: (seg) =>
      setLines((prev) =>
        [...prev, seg].sort((a, b) =>
          a.startMs !== b.startMs
            ? a.startMs - b.startMs
            : a.source.localeCompare(b.source),
        ),
      ),
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
      setLines([]);
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
    setLines([]);
    void start();
  }, [consent, start, t]);

  const isRecording = state === "recording";
  const isStopping = state === "stopping";
  const isBusy =
    state === "requesting" || state === "stopping" || state === "recording";

  return (
    <Stack gap="md">
      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="lg" fw={600}>
                {t("New meeting")}
              </Text>
              <Text size="sm" c="dimmed">
                {t(
                  "Records your mic and (optionally) the meeting tab's audio. Transcribes via Mistral Voxtral every 30 seconds.",
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

          <Group justify="flex-end" gap="xs">
            {!isRecording && !isStopping && (
              <Button
                onClick={onStart}
                disabled={!consent || isBusy}
                leftSection={<IconMicrophone size={16} />}
                color="red"
              >
                {state === "requesting"
                  ? t("Starting...")
                  : t("Start recording")}
              </Button>
            )}
            {isRecording && (
              <>
                <Button
                  variant="default"
                  onClick={() => void cancel()}
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
                  {t("Stop & save")}
                </Button>
              </>
            )}
            {isStopping && (
              <Button
                color="red"
                disabled
                leftSection={<Loader size="xs" color="white" />}
              >
                {t("Stopping & saving…")}
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>

      {lines.length > 0 && (
        <Paper p="md" withBorder>
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={600}>
              {t("Live transcript")}
            </Text>
            <Text size="xs" c="dimmed">
              {lines.length} {t("segments")}
            </Text>
          </Group>
          <ScrollArea h={360}>
            <Stack gap="xs">
              {lines.map((line) => (
                <div
                  key={`${line.source}-${line.sequence}`}
                  style={{
                    paddingLeft: line.source === "mic" ? 0 : 24,
                    borderLeft:
                      line.source === "mic"
                        ? "3px solid var(--mantine-color-blue-5)"
                        : "3px solid var(--mantine-color-grape-5)",
                    paddingTop: 4,
                    paddingBottom: 4,
                    paddingRight: 8,
                    paddingInlineStart: 12,
                  }}
                >
                  <Text size="xs" c="dimmed">
                    [{formatStamp(line.startMs)}]{" "}
                    {line.source === "mic" ? t("Me") : t("Meeting")}
                  </Text>
                  <Text size="sm">{line.text}</Text>
                </div>
              ))}
            </Stack>
          </ScrollArea>
        </Paper>
      )}

      {state === "completed" && (
        <Alert color="green" icon={<IconCheck size={16} />}>
          {t("Meeting saved. Opening transcript view...")}
        </Alert>
      )}
    </Stack>
  );
}
