import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconCircleCheck,
  IconExternalLink,
  IconInfoCircle,
} from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName, getAppUrl, getSuiteAppUrls } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";

interface SuiteApp {
  name: string;
  detail: string;
  url?: string;
  current?: boolean;
}

/**
 * Paramètres › Applications › Connexions: the suite applications deployed
 * for this company, with their real status, plus developer access. Replaces
 * the Meet "Connexions" tab and the raw "Plane settings" link.
 */
export default function Connections() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const hasApiKeys = useHasFeature(Feature.API_KEYS);
  const urls = getSuiteAppUrls();

  if (!isAdmin) {
    return null;
  }

  const apps: SuiteApp[] = [
    {
      name: "ConqrHub",
      detail: t("Documentation, meetings and knowledge. Hosts these settings."),
      url: getAppUrl(),
      current: true,
    },
    {
      name: "ConqrMeet",
      detail: t("Recording, transcription and interview reports."),
      url: urls.meet,
    },
    {
      name: "ConqrPlan",
      detail: t("Projects and work items created from approved actions."),
      url: urls.plane,
    },
    {
      name: "ConqrService",
      detail: t("Help, requests and problem reports."),
      url: urls.service,
    },
  ];

  return (
    <>
      <Helmet>
        <title>
          {t("Connections")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle
        title={t("Connections")}
        description={t(
          "The suite applications linked to this company and the access for developers.",
        )}
        scope="company"
      />

      <Stack gap="lg">
        <div>
          <Text fw={600} mb="xs">
            {t("Suite applications")}
          </Text>
          <Card withBorder padding={0}>
            {apps.map((app, index) => (
              <Group
                key={app.name}
                justify="space-between"
                wrap="nowrap"
                px="md"
                py="sm"
                style={{
                  borderBottom:
                    index < apps.length - 1
                      ? "1px solid var(--border-subtle)"
                      : undefined,
                }}
              >
                <div>
                  <Text fw={500}>{app.name}</Text>
                  <Text size="sm" c="dimmed">
                    {app.detail}
                  </Text>
                </div>
                <Group gap="sm" wrap="nowrap">
                  {app.url ? (
                    <Badge
                      variant="light"
                      color="teal"
                      radius="sm"
                      leftSection={<IconCircleCheck size={12} />}
                      style={{ textTransform: "none" }}
                    >
                      {app.current ? t("This application") : t("Deployed")}
                    </Badge>
                  ) : (
                    <Badge
                      variant="light"
                      color="gray"
                      radius="sm"
                      style={{ textTransform: "none" }}
                    >
                      {t("Not configured")}
                    </Badge>
                  )}
                  {app.url && !app.current && (
                    <Button
                      component="a"
                      href={app.url}
                      target="_blank"
                      rel="noreferrer"
                      variant="default"
                      size="compact-sm"
                      rightSection={<IconExternalLink size={13} />}
                    >
                      {t("Open")}
                    </Button>
                  )}
                </Group>
              </Group>
            ))}
          </Card>
          <Text size="xs" c="dimmed" mt="xs">
            {t(
              "An application is listed as deployed when its address is configured for this company; it is never assumed.",
            )}
          </Text>
        </div>

        <div>
          <Text fw={600} mb="xs">
            {t("Developers")}
          </Text>
          <Card withBorder padding="lg">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={500}>{t("Company API keys")}</Text>
                <Text size="sm" c="dimmed">
                  {t(
                    "Service access with a scope and an expiry. The full key is shown only when it is created.",
                  )}
                </Text>
              </div>
              <Button
                component={Link}
                to="/settings/api-keys"
                variant="default"
                size="compact-sm"
                disabled={!hasApiKeys}
              >
                {t("Manage")}
              </Button>
            </Group>
          </Card>
        </div>

        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          {t("Your personal keys, tied to your own rights, are in")}{" "}
          <Anchor component={Link} to="/settings/account/api-keys">
            {t("My account › API keys")}
          </Anchor>
          .
        </Alert>
      </Stack>
    </>
  );
}
