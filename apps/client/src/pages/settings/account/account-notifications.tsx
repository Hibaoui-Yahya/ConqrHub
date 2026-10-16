import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import {
  ActionIcon,
  Card,
  Group,
  Select,
  Slider,
  Stack,
  Switch,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconAt,
  IconCircleCheck,
  IconFilePencil,
  IconPlayerPlay,
  IconShieldExclamation,
  IconUsers,
  IconVolume,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import NotificationPref from "@/features/user/components/notification-pref";
import {
  NotificationCategory,
  NotificationSoundPrefs,
  playSound,
  resolveSoundPrefs,
  SOUND_NAMES,
  SoundName,
} from "@/features/notification/notification-sounds";

const SOUND_LABELS: Record<SoundName, string> = {
  clair: "Clear",
  doux: "Soft",
  alerte: "Alert",
  discret: "Subtle",
  aucun: "None",
};

const CATEGORIES: {
  key: NotificationCategory;
  title: string;
  detail: string;
  icon: typeof IconCircleCheck;
  color: string;
}[] = [
  {
    key: "ready",
    title: "Meeting ready",
    detail: "Transcript, report and evaluation; report published.",
    icon: IconCircleCheck,
    color: "teal",
  },
  {
    key: "problem",
    title: "Processing problem",
    detail: "Failure, unreadable file.",
    icon: IconAlertTriangle,
    color: "red",
  },
  {
    key: "review",
    title: "Waiting for you",
    detail: "Speakers to confirm, page to approve.",
    icon: IconUsers,
    color: "yellow",
  },
  {
    key: "mention",
    title: "Mentions and replies",
    detail: "Pages and comments in Hub.",
    icon: IconAt,
    color: "blue",
  },
  {
    key: "verification",
    title: "Page verifications",
    detail: "Expiry, invalidation, rejection.",
    icon: IconShieldExclamation,
    color: "orange",
  },
  {
    key: "updates",
    title: "Followed updates",
    detail: "Pages you follow.",
    icon: IconFilePencil,
    color: "gray",
  },
];

/**
 * Paramètres › Mon compte › Notifications: what reaches the person in Hub and
 * Meet, by which channel and with which sound. Saved on change, on the
 * account, so both apps behave the same.
 */
export default function AccountNotifications() {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const [saving, setSaving] = useState(false);
  const prefs = resolveSoundPrefs(
    user?.settings?.preferences?.notificationSounds,
  );

  const save = async (patch: Partial<NotificationSoundPrefs>) => {
    setSaving(true);
    try {
      const updated = await updateUser({ notificationSounds: patch });
      setUser(updated);
    } catch (err) {
      console.error(err);
      notifications.show({ message: t("Failed to update data"), color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const setCategory = (key: NotificationCategory, sound: SoundName) => {
    void save({ categories: { ...prefs.categories, [key]: sound } });
    playSound(sound, prefs.volume);
  };

  return (
    <>
      <Helmet>
        <title>
          {t("Notifications")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle
        title={t("Notifications")}
        description={t(
          "What you are told about in Hub and Meet, through which channel, and with which sound.",
        )}
        scope="account"
      />

      <Stack gap="lg">
        <Card withBorder padding="lg">
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={600}>{t("Notification sounds")}</Text>
                <Text size="sm" c="dimmed">
                  {t(
                    "One short sound per category. Never twice for the same event.",
                  )}
                </Text>
              </div>
              <Switch
                checked={prefs.enabled}
                onChange={(e) =>
                  void save({ enabled: e.currentTarget.checked })
                }
                disabled={saving}
                aria-label={t("Notification sounds")}
              />
            </Group>
            <Group gap="sm" wrap="nowrap">
              <IconVolume size={16} />
              <Slider
                style={{ flex: 1 }}
                min={0}
                max={100}
                step={5}
                value={prefs.volume}
                disabled={!prefs.enabled}
                onChangeEnd={(v) => {
                  void save({ volume: v });
                  playSound(prefs.categories.ready, v);
                }}
                label={(v) => `${v} %`}
                aria-label={t("Volume")}
              />
              <Text size="sm" fw={600} w={44} ta="right">
                {prefs.volume} %
              </Text>
            </Group>
            <Group gap="xl">
              <Switch
                label={t("Sound only when the tab is in the background")}
                checked={prefs.backgroundOnly}
                onChange={(e) =>
                  void save({ backgroundOnly: e.currentTarget.checked })
                }
                disabled={saving || !prefs.enabled}
              />
              <Switch
                label={t("Do not disturb during a recording")}
                checked={prefs.muteWhileRecording}
                onChange={(e) =>
                  void save({ muteWhileRecording: e.currentTarget.checked })
                }
                disabled={saving || !prefs.enabled}
              />
              <Switch
                label={t("Do not disturb")}
                description={t(
                  "No sound at all; notifications still appear in the bell.",
                )}
                checked={prefs.doNotDisturb}
                onChange={(e) =>
                  void save({ doNotDisturb: e.currentTarget.checked })
                }
                disabled={saving}
              />
            </Group>
          </Stack>
        </Card>

        <div>
          <Text fw={600} mb="xs">
            {t("By category")}
          </Text>
          <Card withBorder padding={0}>
            <Table verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("Category")}</Table.Th>
                  <Table.Th w={260}>{t("Sound")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {CATEGORIES.map((c) => (
                  <Table.Tr key={c.key}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon
                          variant="light"
                          color={c.color}
                          radius="md"
                          size={30}
                        >
                          <c.icon size={16} />
                        </ThemeIcon>
                        <div>
                          <Text size="sm" fw={600}>
                            {t(c.title)}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {t(c.detail)}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Select
                          size="xs"
                          w={160}
                          data={SOUND_NAMES.map((s) => ({
                            value: s,
                            label: t(SOUND_LABELS[s], { context: "sound" }),
                          }))}
                          value={prefs.categories[c.key]}
                          onChange={(v) =>
                            v && setCategory(c.key, v as SoundName)
                          }
                          allowDeselect={false}
                          disabled={saving || !prefs.enabled}
                          aria-label={t("Sound") + " — " + t(c.title)}
                        />
                        <Tooltip label={t("Listen")}>
                          <ActionIcon
                            variant="light"
                            radius="xl"
                            onClick={() =>
                              playSound(prefs.categories[c.key], prefs.volume)
                            }
                            disabled={prefs.categories[c.key] === "aucun"}
                            aria-label={t("Listen") + " — " + t(c.title)}
                          >
                            <IconPlayerPlay size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
          <Text size="xs" c="dimmed" mt="xs">
            {t(
              "Sounds only play for notifications that reach the bell. These settings apply to your account, in Hub and in Meet.",
            )}
          </Text>
        </div>

        <NotificationPref />
      </Stack>
    </>
  );
}
