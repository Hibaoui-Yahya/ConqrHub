import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  Container,
  Group,
  SegmentedControl,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { IconChecks, IconSettings } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { getAppName } from "@/lib/config.ts";
import { NotificationList } from "../components/notification-list";
import { SuiteNotificationList } from "@/features/integration/components/suite-notification-list";
import { NotificationFilter, NotificationTab } from "../types/notification.types";
import {
  useMarkAllReadMutation,
  useUnreadCountQuery,
} from "../queries/notification-query";

type PageTab = NotificationTab | "suite";
const TABS: PageTab[] = ["direct", "updates", "all", "suite"];

/**
 * Every notification of the person, beyond what the bell popover shows:
 * tabs, an unread filter, pages of 20 with "Load more", mark one or all
 * as read. The tab and the filter live in the URL so a link can open them.
 */
export default function NotificationsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as PageTab | null;
  const [tab, setTab] = useState<PageTab>(
    tabParam && TABS.includes(tabParam) ? tabParam : "direct",
  );
  const [filter, setFilter] = useState<NotificationFilter>(
    params.get("filter") === "unread" ? "unread" : "all",
  );
  const { data: unread } = useUnreadCountQuery();
  const markAllRead = useMarkAllReadMutation();
  const unreadCount = unread?.count ?? 0;

  const sync = (next: { tab?: PageTab; filter?: NotificationFilter }) => {
    const nextTab = next.tab ?? tab;
    const nextFilter = next.filter ?? filter;
    const search = new URLSearchParams();
    if (nextTab !== "direct") search.set("tab", nextTab);
    if (nextFilter !== "all") search.set("filter", nextFilter);
    setParams(search, { replace: true });
  };

  return (
    <>
      <Helmet>
        <title>
          {t("Notifications")} - {getAppName()}
        </title>
      </Helmet>

      <Container size={820} pt="xl" pb="xl">
        <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
          <div>
            <Title order={3}>{t("Notifications")}</Title>
            <Text size="sm" c="dimmed">
              {unreadCount
                ? t("{{count}} unread notifications", { count: unreadCount })
                : t("You are up to date.")}
            </Text>
          </div>
          <Group gap="xs">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconChecks size={14} />}
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0}
              loading={markAllRead.isPending}
            >
              {t("Mark all as read")}
            </Button>
            <Button
              variant="subtle"
              size="xs"
              component={Link}
              to="/settings/account/notifications"
              leftSection={<IconSettings size={14} />}
            >
              {t("Notification settings")}
            </Button>
          </Group>
        </Group>

        <Group justify="space-between" mb="sm" wrap="wrap">
          <Tabs
            value={tab}
            onChange={(value) => {
              const next = (value as PageTab) ?? "direct";
              setTab(next);
              sync({ tab: next });
            }}
            variant="pills"
          >
            <Tabs.List>
              <Tabs.Tab value="direct">{t("Direct")}</Tabs.Tab>
              <Tabs.Tab value="updates">{t("Updates")}</Tabs.Tab>
              <Tabs.Tab value="all">{t("All")}</Tabs.Tab>
              <Tabs.Tab value="suite">{t("Suite")}</Tabs.Tab>
            </Tabs.List>
          </Tabs>

          {tab !== "suite" && (
            <SegmentedControl
              size="xs"
              value={filter}
              onChange={(value) => {
                const next = value as NotificationFilter;
                setFilter(next);
                sync({ filter: next });
              }}
              data={[
                { value: "all", label: t("All notifications") },
                { value: "unread", label: t("Unread only") },
              ]}
              aria-label={t("Filter")}
            />
          )}
        </Group>

        <Card withBorder padding="xs" radius="md">
          {tab === "suite" ? (
            <SuiteNotificationList />
          ) : (
            <NotificationList
              tab={tab}
              filter={filter}
              onNavigate={() => undefined}
              showLoadMore
            />
          )}
        </Card>
      </Container>
    </>
  );
}
