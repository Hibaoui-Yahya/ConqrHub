import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Anchor, Card, Group, Stack, Text } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";

interface LinkRow {
  title: string;
  detail: string;
  to: string;
  show: boolean;
}

/**
 * Paramètres › Applications › ConqrHub. Everything that only concerns the
 * documentation product, as one page of links instead of five rail entries.
 * The destinations keep their own routes.
 */
export default function HubAppSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const hasVerification = useHasFeature(Feature.PAGE_VERIFICATION);

  const sections: { title: string; rows: LinkRow[] }[] = [
    {
      title: t("Content"),
      rows: [
        {
          title: t("Page templates"),
          detail: t("Structures offered when a page is created."),
          to: "/templates",
          show: true,
        },
        {
          title: t("Verified pages"),
          detail: t("Pages validated by an owner, with an expiry date."),
          to: "/settings/verifications",
          show: hasVerification,
        },
        {
          title: t("AI knowledge base"),
          detail: t("What the assistant is allowed to answer from."),
          to: "/settings/knowledge-base",
          show: isAdmin,
        },
        {
          title: t("Documentation health"),
          detail: t("Stale pages, pages without an owner, never-read pages."),
          to: "/settings/health",
          show: isAdmin,
        },
      ],
    },
    {
      title: t("Sharing"),
      rows: [
        {
          title: t("Public links"),
          detail: t(
            "Pages reachable without an account. Whether members may create them is decided in Company › Security and sign-in.",
          ),
          to: "/settings/sharing",
          show: true,
        },
      ],
    },
    {
      title: t("Link with ConqrPlan"),
      rows: [
        {
          title: t("Spaces ↔ projects mapping"),
          detail: t(
            "Work items created from a page go to the right ConqrPlan project.",
          ),
          to: "/settings/integrations",
          show: isAdmin,
        },
      ],
    },
  ];

  return (
    <>
      <Helmet>
        <title>ConqrHub - {getAppName()}</title>
      </Helmet>
      <SettingsTitle
        title="ConqrHub"
        description={t(
          "Settings specific to the documentation. Everything else applies to the whole suite.",
        )}
        scope="company"
      />

      <Stack gap="lg">
        {sections
          .filter((s) => s.rows.some((r) => r.show))
          .map((section) => (
            <div key={section.title}>
              <Text fw={600} mb="xs">
                {section.title}
              </Text>
              <Card withBorder padding={0}>
                {section.rows
                  .filter((r) => r.show)
                  .map((row, index, all) => (
                    <Anchor
                      key={row.to}
                      component={Link}
                      to={row.to}
                      underline="never"
                      c="inherit"
                      style={{
                        display: "block",
                        borderBottom:
                          index < all.length - 1
                            ? "1px solid var(--border-subtle)"
                            : undefined,
                      }}
                    >
                      <Group
                        justify="space-between"
                        wrap="nowrap"
                        px="md"
                        py="sm"
                      >
                        <div>
                          <Text fw={500}>{row.title}</Text>
                          <Text size="sm" c="dimmed">
                            {row.detail}
                          </Text>
                        </div>
                        <IconChevronRight size={16} />
                      </Group>
                    </Anchor>
                  ))}
              </Card>
            </div>
          ))}
      </Stack>
    </>
  );
}
