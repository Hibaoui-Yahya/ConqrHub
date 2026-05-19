import { Modal, Stack, Text, Group } from "@mantine/core";
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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Voice dictation")}
      centered
      size="sm"
    >
      <Stack align="center" gap="md" py="md">
        <Text size="sm" c="dimmed">
          {t("Click the mic to start recording. Tap again to stop.")}
        </Text>
        <Group justify="center">
          <MicButton
            context={context}
            onTranscript={(text) => {
              onTranscript(text);
              onClose();
            }}
          />
        </Group>
      </Stack>
    </Modal>
  );
}
