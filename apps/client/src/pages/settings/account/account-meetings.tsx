import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
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
import { SettingsScope } from "@/components/settings/settings-scope.tsx";
import { getAppName, getSuiteAppUrls } from "@/lib/config.ts";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { IMeetingDefaults } from "@/features/user/types/user.types.ts";
import {
  MEETING_TYPE_OPTIONS,
  TRANSCRIPTION_LANGUAGE_OPTIONS,
} from "@/features/user/meeting-defaults-options.ts";

/**
 * Paramètres › Mon compte › Mes réunions. These defaults used to live in the
 * ConqrMeet browser (localStorage); on the account they follow the person
 * on every device. Saved on change, like the other preferences.
 */
export default function AccountMeetings() {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const [saving, setSaving] = useState(false);
  const defaults: IMeetingDefaults =
    user?.settings?.preferences?.meetings ?? {};
  const meetUrl = getSuiteAppUrls().meet;

  const save = async (patch: IMeetingDefaults) => {
    setSaving(true);
    try {
      const updated = await updateUser({ meetingDefaults: patch });
      setUser(updated);
      notifications.show({ message: t("Saved · applies to your account.") });
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
        <title>
          {t("My meetings")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle
        title={t("My meetings")}
        description={t(
          "Your defaults to record, transcribe and produce your reports in ConqrMeet.",
        )}
        scope="account"
      />

      <Alert
        icon={<IconInfoCircle size={16} />}
        color="blue"
        variant="light"
        mb="lg"
      >
        {t(
          "New: these settings follow your account. Before, they stayed in one browser and were lost from one device to the next.",
        )}
      </Alert>

      <Stack gap="lg">
        <div>
          <Text fw={600} mb={4}>
            {t("Defaults for my meetings")}
          </Text>
          <Text size="sm" c="dimmed" mb="sm">
            {t(
              "Preselected when you record or import; you can change them for each meeting.",
            )}
          </Text>
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Select
                label={t("Meeting type")}
                description={t(
                  "Leave empty to let the AI pick between interview, team meeting and client call.",
                )}
                placeholder={t("Automatic detection")}
                data={MEETING_TYPE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.label),
                }))}
                value={defaults.defaultMeetingType ?? null}
                onChange={(v) => void save({ defaultMeetingType: v })}
                clearable
                disabled={saving}
              />
              <Select
                label={t("Transcription language")}
                description={t(
                  "Leave empty to use the company default. “Arabic + English” handles meetings that switch between both.",
                )}
                placeholder={t("Company default")}
                data={TRANSCRIPTION_LANGUAGE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: t(o.label),
                }))}
                value={defaults.defaultLanguage ?? null}
                onChange={(v) => void save({ defaultLanguage: v })}
                clearable
                disabled={saving}
              />
              <Switch
                label={t("Process automatically after import")}
                description={t(
                  "Start the transcription and the analysis as soon as a recording arrives.",
                )}
                checked={defaults.autoProcess ?? true}
                onChange={(e) =>
                  void save({ autoProcess: e.currentTarget.checked })
                }
                disabled={saving}
              />
            </Stack>
          </Card>
        </div>

        <div>
          <Text fw={600} mb={4}>
            {t("Microphone and camera")}
          </Text>
          <Card withBorder padding="lg">
            <Stack gap="sm">
              <div>
                <SettingsScope scope="device" />
              </div>
              <Text size="sm" c="dimmed">
                {t(
                  "The microphone and the sound check are chosen in ConqrMeet, on the recording page, because they depend on the device you use.",
                )}
              </Text>
              {meetUrl && (
                <Anchor href={`${meetUrl}/meetings`} size="sm">
                  {t("Open ConqrMeet")}
                </Anchor>
              )}
            </Stack>
          </Card>
        </div>
      </Stack>
    </>
  );
}
