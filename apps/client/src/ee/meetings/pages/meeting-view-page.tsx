import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
  TypographyStylesProvider,
} from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconCopy, IconArrowBackUp, IconSparkles } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getAppName } from "@/lib/config";
import { useAiGenerateMutation } from "@/ee/ai/queries/ai-query";
import { AiAction } from "@/ee/ai/types/ai.types";
import {
  getMeeting,
  getMeetingAudio,
  getMeetingStatus,
  saveAiOutput,
} from "../services/meeting-service";
import {
  MeetingStatusPanel,
  meetingStatusColor,
} from "../components/meeting-status-panel";
import { MeetingTranscriptTab } from "../components/meeting-transcript-tab";
import { MeetingDocumentsTab } from "../components/meeting-documents-tab";
import { MeetingProposalsTab } from "../components/meeting-proposals-tab";
import { isMeetingProcessing } from "../types/meeting.types";
import type {
  Meeting,
  MeetingSegment,
  MeetingStatusResponse,
} from "../types/meeting.types";

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
  const [statusInfo, setStatusInfo] = useState<MeetingStatusResponse | null>(
    null,
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [aiOutputs, setAiOutputs] = useState<Record<Preset, string>>({
    summary: "",
    actions: "",
    decisions: "",
  });
  const [aiLoading, setAiLoading] = useState<Preset | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("overview");
  const prevStatusRef = useRef<string | null>(null);

  const generate = useAiGenerateMutation();

  const loadMeeting = useCallback(() => {
    if (!meetingId) return;
    getMeeting(meetingId)
      .then((d) => {
        setMeeting(d.meeting);
        setSegments(d.segments);
        const persisted = d.meeting.aiOutputs ?? {};
        setAiOutputs({
          summary: persisted.summary ?? "",
          actions: persisted.actions ?? "",
          decisions: persisted.decisions ?? "",
        });
      })
      .catch((err) => {
        notifications.show({
          color: "red",
          message: err?.response?.data?.message ?? t("Failed to load meeting"),
        });
        navigate("/meetings");
      })
      .finally(() => setLoading(false));
  }, [meetingId]);

  const fetchStatus = useCallback(() => {
    if (!meetingId) return;
    getMeetingStatus(meetingId)
      .then(setStatusInfo)
      .catch(() => {
        // Legacy meetings (or a disabled pipeline) have no status
        // endpoint payload — the overview simply hides the panel.
      });
  }, [meetingId]);

  useEffect(() => {
    setLoading(true);
    loadMeeting();
    fetchStatus();
  }, [meetingId]);

  const effectiveStatus = statusInfo?.status ?? meeting?.status ?? null;

  // Poll the pipeline status every 5s while a processing state is
  // active; stops automatically on awaiting_review / published /
  // failed / partially_failed / completed.
  useEffect(() => {
    if (!effectiveStatus || !isMeetingProcessing(effectiveStatus)) return;
    const id = window.setInterval(fetchStatus, 5000);
    return () => window.clearInterval(id);
  }, [effectiveStatus, fetchStatus]);

  // When the pipeline settles, refresh the meeting row so transcript,
  // failure reason and meeting type are up to date.
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = effectiveStatus;
    if (prev && effectiveStatus && prev !== effectiveStatus) {
      loadMeeting();
    }
  }, [effectiveStatus, loadMeeting]);

  // Presigned audio playback — only probe when the server reports audio
  // is actually available (S3/B2 driver + stored original); avoids a
  // guaranteed-404 request on the local storage driver.
  useEffect(() => {
    if (!meetingId || !statusInfo?.audioAvailable) {
      setAudioUrl(null);
      return;
    }
    getMeetingAudio(meetingId, "original")
      .then((res) => setAudioUrl(res.url))
      .catch(() => setAudioUrl(null));
  }, [meetingId, statusInfo?.audioAvailable]);

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
    setActiveTab("overview");
    try {
      const res = (await generate.mutateAsync({
        action: AiAction.CUSTOM,
        content: meeting.transcript,
        prompt: presetCfg.prompt,
      })) as { content?: string; text?: string };
      // Server returns { text, action, usage } on /ai/generate but the
      // shared AiContentResponse type still says `content`. Accept
      // either so we work regardless of which gets fixed first.
      const output = (res.text ?? res.content ?? "").trim();
      if (!output) {
        throw new Error(t("AI returned an empty response"));
      }
      setAiOutputs((prev) => ({ ...prev, [preset]: output }));
      try {
        await saveAiOutput(meeting.id, preset, output);
      } catch (err) {
        // Persistence failure is non-fatal — the user still sees the
        // output in this session. Toast quietly so they know it
        // won't survive a refresh.
        notifications.show({
          color: "yellow",
          message: t("Could not save AI output. It will not persist."),
        });
      }
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
      .then(() => notifications.show({ color: "teal", message: t("Copied") }))
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
            <Group gap="sm" align="center">
              <Title order={2}>{meeting.title}</Title>
              {effectiveStatus && (
                <Badge color={meetingStatusColor(effectiveStatus)}>
                  {t(effectiveStatus)}
                </Badge>
              )}
            </Group>
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

        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview">{t("Overview")}</Tabs.Tab>
            <Tabs.Tab value="transcript">{t("Transcript")}</Tabs.Tab>
            <Tabs.Tab value="documents">{t("Documents")}</Tabs.Tab>
            <Tabs.Tab value="actions">{t("Action Review")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="sm">
            <Stack gap="sm">
              {statusInfo && meetingId && (
                <MeetingStatusPanel
                  meetingId={meetingId}
                  statusInfo={statusInfo}
                  onProcessKicked={fetchStatus}
                />
              )}

              {audioUrl && (
                <Paper p="md" withBorder>
                  <Text size="sm" fw={600} mb="xs">
                    {t("Recording")}
                  </Text>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <audio controls src={audioUrl} style={{ width: "100%" }} />
                </Paper>
              )}

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

              {PRESETS.map((p) =>
                aiOutputs[p.id] || aiLoading === p.id ? (
                  <Paper key={p.id} p="md" withBorder mih={120}>
                    <Text size="sm" fw={600} mb="xs">
                      {t(p.label)}
                    </Text>
                    {aiLoading === p.id && !aiOutputs[p.id] ? (
                      <Stack align="center" justify="center" py="md" gap="xs">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">
                          {t("Generating {{label}}…", { label: t(p.label) })}
                        </Text>
                      </Stack>
                    ) : (
                      <TypographyStylesProvider>
                        <div
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(aiOutputs[p.id]),
                          }}
                        />
                      </TypographyStylesProvider>
                    )}
                  </Paper>
                ) : null,
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="transcript" pt="sm">
            {meetingId && effectiveStatus && (
              <MeetingTranscriptTab
                meetingId={meetingId}
                status={effectiveStatus}
                legacyTranscript={meeting.transcript}
                legacySegments={segments}
                onSpeakersConfirmed={fetchStatus}
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="documents" pt="sm">
            {meetingId && effectiveStatus && (
              <MeetingDocumentsTab
                meetingId={meetingId}
                status={effectiveStatus}
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="actions" pt="sm">
            {meetingId && effectiveStatus && (
              <MeetingProposalsTab
                meetingId={meetingId}
                status={effectiveStatus}
              />
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </>
  );
}
