import SettingsTitle from "@/components/settings/settings-title.tsx";
import WorkspaceNameForm from "@/features/workspace/components/settings/components/workspace-name-form";
import WorkspaceIcon from "@/features/workspace/components/settings/components/workspace-icon.tsx";
import WorkspaceDefaultsForm from "@/features/workspace/components/settings/components/workspace-defaults-form.tsx";
import { useTranslation } from "react-i18next";
import { getAppName, isCloud } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import ManageHostname from "@/ee/components/manage-hostname.tsx";
import { Divider, Text } from "@mantine/core";

export default function WorkspaceSettings() {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>Workspace Settings - {getAppName()}</title>
      </Helmet>
      <SettingsTitle
        title={t("General")}
        description={t(
          "Company identity and the defaults every member starts with.",
        )}
        scope="company"
      />
      <Text fw={600} mb="xs">
        {t("Identity")}
      </Text>
      <Text size="sm" c="dimmed" mb="sm">
        {t("The name and the logo appear in Hub, Meet and in the reports.")}
      </Text>
      <WorkspaceIcon />
      <WorkspaceNameForm />

      {isCloud() && (
        <>
          <Divider my="md" />
          <ManageHostname />
        </>
      )}

      <Divider my="lg" />
      <WorkspaceDefaultsForm />
    </>
  );
}
