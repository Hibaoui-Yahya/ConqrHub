import { Group, Text, Switch, Tooltip } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";

export default function EnableAiStt() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    workspace?.settings?.ai?.stt ?? true,
  );
  const hasAccess = useHasFeature(Feature.AI);
  const upgradeLabel = useUpgradeLabel(4);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updated = await updateWorkspace({ aiStt: value } as any);
      setChecked(value);
      setWorkspace(updated);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Voice input (Speech-to-Text)")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Allow users to dictate into AI Chat, Ask AI, Search, and the page editor. Uses Mistral Voxtral for transcription with a context-aware correction pass.",
          )}
        </Text>
      </div>

      <Tooltip label={upgradeLabel} disabled={hasAccess} refProp="rootRef">
        <Switch
          defaultChecked={checked}
          onChange={handleChange}
          disabled={!hasAccess}
        />
      </Tooltip>
    </Group>
  );
}
