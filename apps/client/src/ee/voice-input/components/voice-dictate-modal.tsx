import { useState, useEffect } from "react";
import {
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { MicButton } from "../mic-button";
import type { SttContext } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  context: SttContext;
  onTranscript: (text: string) => void;
}

export function VoiceDictateModal({
  opened,
  onClose,
  context,
  onTranscript,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  // Reset draft whenever the modal opens, so a previous session's text
  // doesn't bleed into a fresh recording.
  useEffect(() => {
    if (opened) setDraft("");
  }, [opened]);

  const handleInsert = () => {
    const text = draft.trim();
    if (!text) return;
    onTranscript(text);
    setDraft("");
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Voice dictation")}
      centered
      size="md"
    >
      <Stack gap="md" py="xs">
        {!draft && (
          <Stack align="center" gap="xs" py="md">
            <Text size="sm" c="dimmed" ta="center">
              {t("Click the mic to start. Tap again to stop.")}
            </Text>
            <MicButton
              context={context}
              onTranscript={(text) => setDraft(text)}
            />
          </Stack>
        )}

        {draft && (
          <>
            <Text size="xs" c="dimmed">
              {t("Review and edit before inserting into the page.")}
            </Text>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              autosize
              minRows={4}
              maxRows={12}
              autoFocus
            />
            <Group justify="space-between" align="center">
              <MicButton
                context={context}
                onTranscript={(text) =>
                  setDraft((prev) => (prev ? `${prev} ${text}` : text))
                }
              />
              <Group gap="xs">
                <Button variant="default" onClick={onClose}>
                  {t("Cancel")}
                </Button>
                <Button onClick={handleInsert} disabled={!draft.trim()}>
                  {t("Insert into page")}
                </Button>
              </Group>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
