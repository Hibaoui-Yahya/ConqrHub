import React from "react";
import { Divider, Group, Stack, Text, Title } from "@mantine/core";
import {
  SettingsScope,
  SettingsScopeKind,
} from "@/components/settings/settings-scope.tsx";

/**
 * Page heading of a settings page: title, one-line explanation and the
 * scope the settings apply to (account, company or this device).
 */
export default function SettingsTitle({
  title,
  description,
  scope,
  action,
}: {
  title: string;
  description?: string;
  scope?: SettingsScopeKind;
  action?: React.ReactNode;
}) {
  return (
    <>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={6}>
          <Title order={3}>{title}</Title>
          {description && (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          )}
          {scope && (
            <div>
              <SettingsScope scope={scope} />
            </div>
          )}
        </Stack>
        {action}
      </Group>
      <Divider my="md" />
    </>
  );
}
