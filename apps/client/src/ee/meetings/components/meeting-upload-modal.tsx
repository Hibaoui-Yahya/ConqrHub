import { useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  FileInput,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconAlertCircle, IconUpload } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { uploadMeeting } from "../services/meeting-service";
import { MEETING_TYPE_OPTIONS } from "../types/meeting.types";

const ACCEPTED_MIME_TYPES =
  "audio/webm,audio/ogg,audio/mpeg,audio/mp4,video/mp4,audio/wav,audio/x-m4a,audio/flac";

interface MeetingUploadModalProps {
  opened: boolean;
  onClose: () => void;
}

export function MeetingUploadModal({
  opened,
  onClose,
}: MeetingUploadModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFile(null);
    setTitle("");
    setMeetingType(null);
    setConsent(false);
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const onSubmit = async () => {
    if (!file || !consent) return;
    setSubmitting(true);
    setError(null);
    try {
      const meeting = await uploadMeeting({
        file,
        consent: true,
        title: title.trim() || undefined,
        meetingType: meetingType || undefined,
      });
      notifications.show({
        color: "teal",
        title: t("Upload complete"),
        message: t(
          "Processing has started. You can follow progress on the meeting page.",
        ),
      });
      reset();
      onClose();
      navigate(`/meetings/${meeting.id}`);
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message;
      if (status === 409) {
        setError(
          message ??
            t(
              "This recording was already uploaded. Opening the existing meeting instead.",
            ),
        );
      } else if (status === 413) {
        setError(message ?? t("The file is too large."));
      } else {
        setError(message ?? t("Upload failed. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("Upload recording")}
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "Upload an audio or video recording of a meeting. It will be transcribed and analyzed automatically.",
          )}
        </Text>

        <FileInput
          label={t("Recording file")}
          placeholder={t("Choose an audio or video file")}
          accept={ACCEPTED_MIME_TYPES}
          value={file}
          onChange={setFile}
          leftSection={<IconUpload size={16} />}
          disabled={submitting}
          required
        />

        <TextInput
          label={t("Title (optional)")}
          placeholder={t("e.g. Weekly product sync")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          disabled={submitting}
        />

        <Select
          label={t("Meeting type (optional)")}
          placeholder={t("Detect automatically")}
          data={MEETING_TYPE_OPTIONS.map((o) => ({
            value: o.value,
            label: t(o.label),
          }))}
          value={meetingType}
          onChange={setMeetingType}
          clearable
          disabled={submitting}
        />

        <Checkbox
          label={t("All participants have consented to this recording")}
          checked={consent}
          onChange={(e) => setConsent(e.currentTarget.checked)}
          disabled={submitting}
        />

        {error && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
          >
            <Text size="sm">{error}</Text>
          </Alert>
        )}

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={handleClose} disabled={submitting}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={() => void onSubmit()}
            disabled={!file || !consent}
            loading={submitting}
            leftSection={<IconUpload size={16} />}
          >
            {t("Upload")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
