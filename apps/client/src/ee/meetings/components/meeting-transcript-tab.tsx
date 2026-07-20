import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconUsers } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getMeetingTranscript,
  reviewTranscriptSpeakers,
} from "../services/meeting-service";
import type {
  CanonicalTranscript,
  MeetingSegment,
  MeetingStatusEx,
  TranscriptSegmentEx,
} from "../types/meeting.types";

const LOW_CONFIDENCE = 0.6;

function formatStamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface SpeakerGroup {
  speaker: string;
  startMs: number;
  segments: TranscriptSegmentEx[];
}

function groupBySpeaker(segments: TranscriptSegmentEx[]): SpeakerGroup[] {
  const groups: SpeakerGroup[] = [];
  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.segments.push(seg);
    } else {
      groups.push({
        speaker: seg.speaker,
        startMs: seg.startMs,
        segments: [seg],
      });
    }
  }
  return groups;
}

interface MeetingTranscriptTabProps {
  meetingId: string;
  status: MeetingStatusEx;
  legacyTranscript: string | null;
  legacySegments: MeetingSegment[];
  onSpeakersConfirmed: () => void;
}

export function MeetingTranscriptTab({
  meetingId,
  status,
  legacyTranscript,
  legacySegments,
  onSpeakersConfirmed,
}: MeetingTranscriptTabProps) {
  const { t } = useTranslation();
  const [transcript, setTranscript] = useState<CanonicalTranscript | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editingSpeakers, setEditingSpeakers] = useState(false);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const load = () => {
    setLoading(true);
    getMeetingTranscript(meetingId, "latest")
      .then((tr) => {
        setTranscript(tr);
        setNotFound(false);
        const initial: Record<string, string> = {};
        for (const [label, sp] of Object.entries(tr.speakers ?? {})) {
          initial[label] = sp.displayName ?? label;
        }
        setRenames(initial);
      })
      .catch((err: any) => {
        if (err?.response?.status === 404) {
          setNotFound(true);
        } else {
          notifications.show({
            color: "red",
            message:
              err?.response?.data?.message ?? t("Failed to load transcript"),
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Refetch when the pipeline status changes — a canonical transcript
    // may have just landed (transcribed) or been replaced (speaker
    // review created a new version).
  }, [meetingId, status]);

  const speakersPendingReview = status === "speakers_pending_review";
  const showReviewPanel =
    transcript !== null && (speakersPendingReview || editingSpeakers);

  const groups = useMemo(
    () => (transcript ? groupBySpeaker(transcript.segments ?? []) : []),
    [transcript],
  );

  const speakerName = (label: string): string => {
    const sp = transcript?.speakers?.[label];
    return sp?.displayName || label;
  };

  const confirmSpeakers = async () => {
    if (!transcript) return;
    setConfirming(true);
    try {
      const changed: Record<string, string> = {};
      for (const [label, name] of Object.entries(renames)) {
        const current = transcript.speakers?.[label]?.displayName ?? label;
        const trimmed = name.trim();
        if (trimmed && trimmed !== current) changed[label] = trimmed;
      }
      await reviewTranscriptSpeakers(meetingId, {
        baseVersion: transcript.version,
        renames: Object.keys(changed).length > 0 ? changed : undefined,
        confirm: true,
      });
      notifications.show({
        color: "teal",
        message: speakersPendingReview
          ? t("Speakers confirmed. Analysis continues.")
          : t("Speaker names updated."),
      });
      setEditingSpeakers(false);
      onSpeakersConfirmed();
      load();
    } catch (err: any) {
      notifications.show({
        color: "red",
        message:
          err?.response?.data?.message ?? t("Failed to save speaker changes"),
      });
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      </Paper>
    );
  }

  // Fallback: no canonical transcript yet — show the legacy live view.
  if (notFound || !transcript) {
    return (
      <Paper p="md" withBorder>
        {legacySegments.length === 0 && !legacyTranscript ? (
          <Text size="sm" c="dimmed">
            {t("No transcribed content.")}
          </Text>
        ) : legacySegments.length > 0 ? (
          <ScrollArea h={560}>
            <Stack gap="xs">
              {legacySegments.map((seg) => (
                <div
                  key={seg.id}
                  style={{
                    borderLeft:
                      seg.source === "mic"
                        ? "3px solid var(--mantine-color-blue-5)"
                        : "3px solid var(--mantine-color-grape-5)",
                    paddingLeft: 12,
                    paddingTop: 4,
                    paddingBottom: 4,
                  }}
                >
                  <Text size="xs" c="dimmed">
                    [{formatStamp(seg.startMs)}]{" "}
                    {seg.source === "mic" ? t("Me") : t("Meeting")}
                  </Text>
                  <Text size="sm">{seg.text}</Text>
                </div>
              ))}
            </Stack>
          </ScrollArea>
        ) : (
          <ScrollArea h={560}>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {legacyTranscript}
            </Text>
          </ScrollArea>
        )}
      </Paper>
    );
  }

  return (
    <Stack gap="sm">
      {speakersPendingReview && !editingSpeakers && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color="yellow"
          variant="light"
        >
          <Text size="sm">
            {t(
              "Speaker identification needs your review before the analysis can continue. Name the speakers below and confirm.",
            )}
          </Text>
        </Alert>
      )}

      {showReviewPanel && (
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group gap="xs">
              <IconUsers size={16} />
              <Text size="sm" fw={600}>
                {t("Speaker review")}
              </Text>
            </Group>
            {Object.entries(transcript.speakers ?? {}).map(([label, sp]) => (
              <Group key={label} gap="sm" align="center">
                <Badge variant="light" w={60}>
                  {label}
                </Badge>
                <TextInput
                  size="xs"
                  w={240}
                  value={renames[label] ?? ""}
                  onChange={(e) =>
                    setRenames((prev) => ({
                      ...prev,
                      [label]: e.currentTarget.value,
                    }))
                  }
                  placeholder={t("Speaker name")}
                />
                {sp.confidence != null && (
                  <Text size="xs" c="dimmed">
                    {Math.round(sp.confidence * 100)}%
                  </Text>
                )}
              </Group>
            ))}
            <Group justify="flex-end" gap="xs">
              {!speakersPendingReview && (
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setEditingSpeakers(false)}
                  disabled={confirming}
                >
                  {t("Cancel")}
                </Button>
              )}
              <Button
                size="xs"
                leftSection={<IconCheck size={14} />}
                loading={confirming}
                onClick={() => void confirmSpeakers()}
              >
                {t("Confirm speakers")}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      <Paper p="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {t("Transcript")}
            </Text>
            <Badge size="sm" variant="light">
              {t("v{{version}}", { version: transcript.version })}
            </Badge>
            {transcript.language && (
              <Badge size="sm" variant="light" color="gray">
                {transcript.language}
              </Badge>
            )}
          </Group>
          {!showReviewPanel && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconUsers size={14} />}
              onClick={() => setEditingSpeakers(true)}
            >
              {t("Edit speakers")}
            </Button>
          )}
        </Group>

        {groups.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t("No transcribed content.")}
          </Text>
        ) : (
          <ScrollArea h={560}>
            <Stack gap="md">
              {groups.map((group, gi) => (
                <div key={`${group.speaker}-${gi}`}>
                  <Group gap="xs" mb={4}>
                    <Text size="sm" fw={600}>
                      {speakerName(group.speaker)}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {formatStamp(group.startMs)}
                    </Badge>
                  </Group>
                  <Stack gap={2}>
                    {group.segments.map((seg) => (
                      <Text
                        key={seg.id}
                        size="sm"
                        style={
                          seg.confidence != null &&
                          seg.confidence < LOW_CONFIDENCE
                            ? { opacity: 0.55 }
                            : undefined
                        }
                      >
                        {seg.text}
                      </Text>
                    ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Paper>
    </Stack>
  );
}
