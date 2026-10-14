import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { Link } from "react-router-dom";
import {
  Alert,
  Anchor,
  Card,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspaceMeetSettings } from "@/features/workspace/types/workspace.types.ts";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { TRANSCRIPTION_LANGUAGE_OPTIONS } from "@/features/user/meeting-defaults-options.ts";

const RETENTION_OPTIONS = [
  { value: "30", label: "30 days after the meeting" },
  { value: "90", label: "90 days after the meeting" },
  { value: "180", label: "180 days after the meeting" },
  { value: "365", label: "One year after the meeting" },
];

/**
 * Paramètres › Applications › ConqrMeet. Company-wide recording rules that
 * had no screen at all (consent was hard-coded in ConqrMeet). ConqrMeet
 * reads them through the account profile. Saved on change.
 */
export default function MeetAppSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [saving, setSaving] = useState(false);
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const meet: IWorkspaceMeetSettings = workspace?.settings?.meet ?? {};

  if (!isAdmin) {
    return null;
  }

  const save = async (patch: IWorkspaceMeetSettings) => {
    setSaving(true);
    try {
      const updated = await updateWorkspace({ meetSettings: patch });
      setWorkspace(updated);
      notifications.show({ message: t("Saved · applies to every member.") });
    } catch (err) {
      console.error(err);
      notifications.show({
        message: t("Failed to update data"),
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>ConqrMeet - {getAppName()}</title>
      </Helmet>
      <SettingsTitle
        title="ConqrMeet"
        description={t(
          "Recording rules, transcription and publication, for the whole company.",
        )}
        scope="company"
      />

      <Alert
        icon={<IconInfoCircle size={16} />}
        color="blue"
        variant="light"
        mb="lg"
      >
        {t("Your own defaults (meeting type, language) are in")}{" "}
        <Anchor component={Link} to="/settings/account/meetings">
          {t("My account › My meetings")}
        </Anchor>
        .
      </Alert>

      <Stack gap="lg">
        <div>
          <Text fw={600} mb="xs">
            {t("Recording")}
          </Text>
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Switch
                label={t(
                  "Ask for the participants' consent before every recording",
                )}
                description={t(
                  "The recorder shows the consent script and will not start until it is confirmed (Quebec Law 25).",
                )}
                checked={meet.consentRequired ?? true}
                onChange={(e) =>
                  void save({ consentRequired: e.currentTarget.checked })
                }
                disabled={saving}
              />
              <Select
                label={t("Audio retention")}
                description={t(
                  "The transcript and the report are kept; only the audio file is deleted.",
                )}
                placeholder={t("Keep as long as the meeting exists")}
                data={RETENTION_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.label),
                }))}
                value={
                  meet.audioRetentionDays
                    ? String(meet.audioRetentionDays)
                    : null
                }
                onChange={(v) =>
                  void save({ audioRetentionDays: v ? Number(v) : null })
                }
                clearable
                disabled={saving}
              />
              <Select
                label={t("Transcription language offered by default")}
                description={t(
                  "Each member can choose another default in My meetings.",
                )}
                placeholder={t("Automatic detection")}
                data={TRANSCRIPTION_LANGUAGE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.label),
                }))}
                value={meet.defaultLanguage ?? null}
                onChange={(v) => void save({ defaultLanguage: v })}
                clearable
                disabled={saving}
              />
            </Stack>
          </Card>
        </div>

        <div>
          <Text fw={600} mb="xs">
            {t("Publication in ConqrHub")}
          </Text>
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Select
                label={t("Destination space")}
                description={t(
                  "Published reports are filed in this space unless the person picks another one.",
                )}
                placeholder={t("Ask each time")}
                data={(spaces?.items ?? []).map((s) => ({
                  value: s.id,
                  label: s.name,
                }))}
                value={meet.publishSpaceId ?? null}
                onChange={(v) => void save({ publishSpaceId: v })}
                searchable
                clearable
                disabled={saving}
              />
              <Switch
                label={t("Automatic publication")}
                description={t(
                  "Publish the report as soon as the interviewer validates it.",
                )}
                checked={meet.autoPublish ?? false}
                onChange={(e) =>
                  void save({ autoPublish: e.currentTarget.checked })
                }
                disabled={saving || !meet.publishSpaceId}
              />
            </Stack>
          </Card>
        </div>
      </Stack>
    </>
  );
}
