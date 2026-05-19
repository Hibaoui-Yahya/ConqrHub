import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  Title,
  TypographyStylesProvider,
} from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  IconCopy,
  IconArrowBackUp,
  IconSparkles,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getAppName } from "@/lib/config";
import { useAiGenerateMutation } from "@/ee/ai/queries/ai-query";
import { AiAction } from "@/ee/ai/types/ai.types";
import { getMeeting } from "../services/meeting-service";
import type { Meeting, MeetingSegment } from "../types/meeting.types";

const SUMMARY_PROMPT =
  "Summarize this meeting transcript in 5-8 bullet points. Focus on the main topics discussed, not who said what. Be specific.";
const ACTION_ITEMS_PROMPT =
  "Extract a checklist of action items from this meeting transcript. For each item, include the owner (the person responsible) if mentioned, and the deadline if mentioned. Output as a markdown checklist. Skip the summary — list items only.";
const DECISIONS_PROMPT =
  "Extract every concrete decision made during this meeting. Output as a bulleted markdown list, one decision per bullet. Be specific and concise. If no decisions were made, say so explicitly.";

type Preset = "summary" | "actions" | "decisions";

const PRESETS: { id: Preset; label: string; prompt: string }[] = [
  { id: "summary", label: "Summary", prompt: SUMMARY_PROMPT },
  { id: "actions", label: "Action items", prompt: ACTION_ITEMS_PROMPT },
  { id: "decisions", label: "Decisions", prompt: DECISIONS_PROMPT },
];

function formatStamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string);
}

export default function MeetingViewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { meetingId } = useParams<{ meetingId: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<MeetingSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiOutputs, setAiOutputs] = useState<Record<Preset, string>>({
    summary: "",
    actions: "",
    decisions: "",
  });
  const [aiLoading, setAiLoading] = useState<Preset | null>(null);

  const generate = useAiGenerateMutation();

  useEffect(() => {
    if (!meetingId) return;
    setLoading(true);
    getMeeting(meetingId)
      .then((d) => {
        setMeeting(d.meeting);
        setSegments(d.segments);
      })
      .catch((err) => {
        notifications.show({
          color: "red",
          message:
            err?.response?.data?.message ?? t("Failed to load meeting"),
        });
        navigate("/meetings");
      })
      .finally(() => setLoading(false));
  }, [meetingId]);

  const runPreset = async (preset: Preset) => {
    if (!meeting?.transcript) {
      notifications.show({
        color: "yellow",
        message: t("Transcript is empty"),
      });
      return;
    }
    const presetCfg = PRESETS.find((p) => p.id === preset);
    if (!presetCfg) return;
    setAiLoading(preset);
    try {
      const res = await generate.mutateAsync({
        action: AiAction.CUSTOM,
        content: meeting.transcript,
        prompt: presetCfg.prompt,
      });
      setAiOutputs((prev) => ({ ...prev, [preset]: res.content }));
    } catch (err: any) {
      notifications.show({
        color: "red",
        message: err?.message ?? t("AI generation failed"),
      });
    } finally {
      setAiLoading(null);
    }
  };

  const copyTranscript = () => {
    if (!meeting?.transcript) return;
    navigator.clipboard
      .writeText(meeting.transcript)
      .then(() =>
        notifications.show({ color: "teal", message: t("Copied") }),
      )
      .catch(() =>
        notifications.show({ color: "red", message: t("Copy failed") }),
      );
  };

  if (loading) {
    return (
      <Stack align="center" justify="center" p="xl">
        <Loader />
      </Stack>
    );
  }

  if (!meeting) return null;

  return (
    <>
      <Helmet>
        <title>
          {meeting.title} - {getAppName()}
        </title>
      </Helmet>
      <Stack gap="md" p="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconArrowBackUp size={14} />}
              onClick={() => navigate("/meetings")}
            >
              {t("All meetings")}
            </Button>
            <Title order={2}>{meeting.title}</Title>
            <Text size="sm" c="dimmed">
              {new Date(meeting.startedAt).toLocaleString()}
              {meeting.durationMs
                ? ` · ${Math.round(meeting.durationMs / 1000)}s`
                : ""}
            </Text>
          </div>
          <Button
            variant="default"
            leftSection={<IconCopy size={14} />}
            onClick={copyTranscript}
            disabled={!meeting.transcript}
          >
            {t("Copy transcript")}
          </Button>
        </Group>

        <Group gap="xs">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              size="sm"
              variant="light"
              leftSection={<IconSparkles size={14} />}
              loading={aiLoading === p.id}
              onClick={() => void runPreset(p.id)}
              disabled={!meeting.transcript || aiLoading !== null}
            >
              {t(p.label)}
            </Button>
          ))}
        </Group>

        <Tabs defaultValue="transcript">
          <Tabs.List>
            <Tabs.Tab value="transcript">{t("Transcript")}</Tabs.Tab>
            {(["summary", "actions", "decisions"] as Preset[]).map((p) =>
              aiOutputs[p] ? (
                <Tabs.Tab key={p} value={p}>
                  {t(PRESETS.find((x) => x.id === p)!.label)}
                </Tabs.Tab>
              ) : null,
            )}
          </Tabs.List>

          <Tabs.Panel value="transcript" pt="sm">
            <Paper p="md" withBorder>
              {segments.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t("No transcribed content.")}
                </Text>
              ) : (
                <ScrollArea h={560}>
                  <Stack gap="xs">
                    {segments.map((seg) => (
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
              )}
            </Paper>
          </Tabs.Panel>

          {(["summary", "actions", "decisions"] as Preset[]).map((p) =>
            aiOutputs[p] ? (
              <Tabs.Panel key={p} value={p} pt="sm">
                <Paper p="md" withBorder>
                  <TypographyStylesProvider>
                    <div
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(aiOutputs[p]),
                      }}
                    />
                  </TypographyStylesProvider>
                </Paper>
              </Tabs.Panel>
            ) : null,
          )}
        </Tabs>
      </Stack>
    </>
  );
}
