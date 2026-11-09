import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import {
  NotificationChannel,
  NotificationSettingKey,
} from "@/features/user/types/user.types.ts";
import { Card, Switch, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

type Row = {
  key: NotificationSettingKey;
  label: string;
  description: string;
  /** Kinds that never send an e-mail only have the bell switch. */
  email: boolean;
};

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Pages and comments",
    rows: [
      {
        key: "page.updated",
        label: "Page updates",
        description: "Get notified when pages you watch are updated.",
        email: true,
      },
      {
        key: "page.userMention",
        label: "Page mentions",
        description: "Get notified when someone mentions you on a page.",
        email: true,
      },
      {
        key: "comment.userMention",
        label: "Comment mentions",
        description: "Get notified when someone mentions you in a comment.",
        email: true,
      },
      {
        key: "comment.created",
        label: "New comments",
        description:
          "Get notified about new comments on threads you participate in.",
        email: true,
      },
      {
        key: "comment.resolved",
        label: "Resolved comments",
        description: "Get notified when your comment is resolved.",
        email: true,
      },
      {
        key: "page.permissionGranted",
        label: "Access granted",
        description: "Someone gives you access to a page.",
        email: true,
      },
    ],
  },
  {
    title: "Knowledge base",
    rows: [
      {
        key: "page.verification",
        label: "Page verifications",
        description:
          "A verification you own expires soon, has expired, was invalidated or approved.",
        email: true,
      },
      {
        key: "page.approval",
        label: "Approvals",
        description: "A page waits for your approval, or yours was returned.",
        email: true,
      },
      {
        key: "docHealth.dropped",
        label: "Documentation health",
        description: "The health score you follow drops below its threshold.",
        email: true,
      },
    ],
  },
  {
    title: "Meetings",
    rows: [
      {
        key: "meeting.ready",
        label: "Meeting ready",
        description: "Transcript and report of your recording are ready.",
        email: true,
      },
      {
        key: "meeting.failed",
        label: "Processing problem",
        description: "The processing of your recording failed.",
        email: true,
      },
      {
        key: "meeting.reviewNeeded",
        label: "Review needed",
        description: "Speakers or proposals of a meeting wait for you.",
        email: false,
      },
      {
        key: "meeting.published",
        label: "Report published",
        description: "The report of your meeting was published in Hub.",
        email: false,
      },
    ],
  },
];

const BUCKET: Record<NotificationChannel, "notifications" | "inAppNotifications"> = {
  email: "notifications",
  inApp: "inAppNotifications",
};

function ChannelSwitch({
  settingKey,
  channel,
  label,
}: {
  settingKey: NotificationSettingKey;
  channel: NotificationChannel;
  label: string;
}) {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const [checked, setChecked] = useState(
    user.settings?.[BUCKET[channel]]?.[settingKey] !== false,
  );
  const [saving, setSaving] = useState(false);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setChecked(value);
    setSaving(true);
    try {
      const updatedUser = await updateUser({
        notificationPreference: { key: settingKey, channel, enabled: value },
      });
      setUser(updatedUser);
    } catch {
      setChecked(!value);
      notifications.show({ message: t("Failed to update data"), color: "red" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Switch
      checked={checked}
      onChange={handleChange}
      disabled={saving}
      aria-label={label}
      styles={{ body: { justifyContent: "center" } }}
    />
  );
}

/**
 * What reaches the person, kind by kind, in the bell and by e-mail. The
 * server applies these switches when it creates a notification and when
 * it queues the e-mail.
 */
export default function NotificationPref() {
  const { t } = useTranslation();

  return (
    <div>
      <Text fw={600} mb="xs">
        {t("Delivery by kind")}
      </Text>
      <Card withBorder padding={0}>
        <Table verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Notification")}</Table.Th>
              <Table.Th w={110} ta="center">
                {t("In the app")}
              </Table.Th>
              <Table.Th w={90} ta="center">
                {t("E-mail")}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {GROUPS.map((group) => (
              <React.Fragment key={group.title}>
                <Table.Tr>
                  <Table.Td colSpan={3} bg="var(--mantine-color-default-hover)">
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      {t(group.title)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
                {group.rows.map((row) => (
                  <Table.Tr key={row.key}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {t(row.label)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {t(row.description)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <ChannelSwitch
                        settingKey={row.key}
                        channel="inApp"
                        label={`${t(row.label)} — ${t("In the app")}`}
                      />
                    </Table.Td>
                    <Table.Td>
                      {row.email ? (
                        <ChannelSwitch
                          settingKey={row.key}
                          channel="email"
                          label={`${t(row.label)} — ${t("E-mail")}`}
                        />
                      ) : (
                        <Text size="xs" c="dimmed" ta="center">
                          —
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </React.Fragment>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </div>
  );
}
