import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TypographyStylesProvider,
} from "@mantine/core";
import { IconExternalLink, IconSend } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { SpaceSelect } from "@/features/space/components/sidebar/space-select";
import { getPageById } from "@/features/page/services/page-service";
import { buildPageUrl } from "@/features/page/page.utils";
import type { ISpace } from "@/features/space/types/space.types";
import {
  listMeetingDocuments,
  publishMeetingDocument,
} from "../services/meeting-service";
import type { MeetingDocument, MeetingStatusEx } from "../types/meeting.types";

function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md) as string);
}

async function resolvePageUrl(pageId: string): Promise<string | null> {
  try {
    const page = await getPageById({ pageId });
    if (!page?.slugId) return null;
    return buildPageUrl(page.space?.slug, page.slugId, page.title);
  } catch {
    return null;
  }
}

interface MeetingDocumentsTabProps {
  meetingId: string;
  status: MeetingStatusEx;
}

export function MeetingDocumentsTab({
  meetingId,
  status,
}: MeetingDocumentsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<MeetingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishTarget, setPublishTarget] = useState<MeetingDocument | null>(
    null,
  );
  const [selectedSpace, setSelectedSpace] = useState<ISpace | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setLoading(true);
    listMeetingDocuments(meetingId)
      .then(setDocuments)
      .catch((err: any) => {
        notifications.show({
          color: "red",
          message:
            err?.response?.data?.message ?? t("Failed to load documents"),
        });
      })
      .finally(() => setLoading(false));
    // Refetch when the pipeline status changes — documents appear once
    // the documents_generating step completes.
  }, [meetingId, status]);

  const openPage = async (pageId: string) => {
    const url = await resolvePageUrl(pageId);
    if (url) {
      navigate(url);
    } else {
      notifications.show({
        color: "yellow",
        message: t("Could not resolve the published page."),
      });
    }
  };

  const publish = async () => {
    if (!publishTarget || !selectedSpace) return;
    setPublishing(true);
    try {
      const res = await publishMeetingDocument(meetingId, publishTarget.id, {
        spaceId: selectedSpace.id,
      });
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === publishTarget.id
            ? {
                ...d,
                pageId: res.pageId,
                status: res.documentStatus ?? "published",
              }
            : d,
        ),
      );
      const url = res.pageUrl ?? (await resolvePageUrl(res.pageId));
      notifications.show({
        color: "teal",
        title: t("Document published"),
        message: url ? (
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconExternalLink size={12} />}
            onClick={() => navigate(url)}
          >
            {t("View page")}
          </Button>
        ) : (
          t("The document was published to '{{space}}'.", {
            space: selectedSpace.name,
          })
        ),
      });
      setPublishTarget(null);
      setSelectedSpace(null);
    } catch (err: any) {
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to publish"),
      });
    } finally {
      setPublishing(false);
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

  if (documents.length === 0) {
    return (
      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed">
          {t("No documents generated yet.")}
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="sm">
      {documents.map((doc) => (
        <Paper key={doc.id} p="md" withBorder>
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600}>{doc.title}</Text>
                <Group gap="xs" mt={4}>
                  {doc.templateId && (
                    <Badge size="sm" variant="light">
                      {doc.templateId}
                    </Badge>
                  )}
                  <Badge
                    size="sm"
                    color={doc.status === "published" ? "teal" : "gray"}
                  >
                    {t(doc.status)}
                  </Badge>
                  {doc.transcriptVersion != null && (
                    <Badge size="sm" variant="light" color="gray">
                      {t("transcript v{{version}}", {
                        version: doc.transcriptVersion,
                      })}
                    </Badge>
                  )}
                </Group>
              </div>
              <Group gap="xs">
                {doc.pageId ? (
                  <Button
                    size="xs"
                    variant="default"
                    leftSection={<IconExternalLink size={14} />}
                    onClick={() => void openPage(doc.pageId!)}
                  >
                    {t("View page")}
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    leftSection={<IconSend size={14} />}
                    onClick={() => setPublishTarget(doc)}
                  >
                    {t("Publish")}
                  </Button>
                )}
              </Group>
            </Group>

            <ScrollArea.Autosize mah={320}>
              <TypographyStylesProvider>
                <div
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(doc.contentMarkdown ?? ""),
                  }}
                />
              </TypographyStylesProvider>
            </ScrollArea.Autosize>
          </Stack>
        </Paper>
      ))}

      <Modal
        opened={publishTarget !== null}
        onClose={() => {
          if (publishing) return;
          setPublishTarget(null);
          setSelectedSpace(null);
        }}
        title={t("Publish document")}
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t(
              "Choose the space where '{{title}}' will be created as a page.",
              {
                title: publishTarget?.title ?? "",
              },
            )}
          </Text>
          <SpaceSelect
            label={t("Space")}
            value={selectedSpace?.slug}
            onChange={(space) => setSelectedSpace(space ?? null)}
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                setPublishTarget(null);
                setSelectedSpace(null);
              }}
              disabled={publishing}
            >
              {t("Cancel")}
            </Button>
            <Button
              leftSection={<IconSend size={14} />}
              onClick={() => void publish()}
              disabled={!selectedSpace}
              loading={publishing}
            >
              {t("Publish")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
