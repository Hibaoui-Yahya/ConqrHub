import React, { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Group,
  ScrollArea,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconActivityHeartbeat,
  IconArrowLeft,
  IconBell,
  IconBook,
  IconBuilding,
  IconCoin,
  IconHistory,
  IconKey,
  IconLicense,
  IconLock,
  IconMicrophone,
  IconPlug,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconUser,
  IconUsers,
  IconWaveSine,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import classes from "./settings.module.css";
import { useTranslation } from "react-i18next";
import { isCloud } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useAtom } from "jotai";
import { entitlementAtom } from "@/ee/entitlement/entitlement-atom";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import {
  prefetchApiKeys,
  prefetchBilling,
  prefetchGroups,
  prefetchSsoProviders,
  prefetchSpaces,
  prefetchWorkspaceMembers,
  prefetchAuditLogs,
} from "@/components/settings/settings-queries.tsx";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { useSettingsNavigation } from "@/hooks/use-settings-navigation";
import {
  captureSettingsReturn,
  clearSettingsReturn,
  readSettingsReturn,
} from "@/components/settings/settings-return.ts";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";

type DataItem = {
  label: string;
  icon: React.ElementType;
  path: string;
  /** Words that make the item findable from the search box. */
  keywords?: string;
  feature?: string;
  role?: "admin" | "owner";
  env?: "cloud" | "selfhosted";
  prefetch?: () => void;
};

type DataGroup = {
  heading: string;
  items: DataItem[];
};

/**
 * One rail for the whole suite: what concerns the person, what concerns the
 * company, and what is specific to one application. Product-only pages
 * (templates, verified pages, documentation health, public sharing, Plan
 * mapping, knowledge base) live behind "ConqrHub"; Meet rules behind
 * "ConqrMeet". Old routes keep working.
 */
const groupedData: DataGroup[] = [
  {
    heading: "My account",
    items: [
      {
        label: "Profile",
        icon: IconUser,
        path: "/settings/account/profile",
        keywords: "name email password 2fa two-factor sessions avatar photo",
      },
      {
        label: "Preferences",
        icon: IconSettings,
        path: "/settings/account/preferences",
        keywords: "theme appearance dark light language notifications",
      },
      {
        label: "Notifications",
        icon: IconBell,
        path: "/settings/account/notifications",
        keywords: "sound sounds bell alerts email do not disturb volume",
      },
      {
        label: "My meetings",
        icon: IconWaveSine,
        path: "/settings/account/meetings",
        keywords: "meeting type transcription language microphone recording",
      },
      {
        label: "API keys",
        icon: IconKey,
        path: "/settings/account/api-keys",
        feature: Feature.API_KEYS,
        prefetch: prefetchApiKeys,
      },
    ],
  },
  {
    heading: "Company",
    items: [
      {
        label: "General",
        icon: IconBuilding,
        path: "/settings/workspace",
        keywords: "name logo default language timezone sender email",
      },
      {
        label: "Members and groups",
        icon: IconUsers,
        path: "/settings/members",
        keywords: "invite roles owner admin member groups invitations",
        prefetch: prefetchWorkspaceMembers,
      },
      {
        label: "Spaces",
        icon: IconBook,
        path: "/settings/spaces",
        prefetch: prefetchSpaces,
      },
      {
        label: "Security and sign-in",
        icon: IconLock,
        path: "/settings/security",
        keywords:
          "sso saml oidc mfa 2fa domains trash retention public sharing",
        feature: Feature.SECURITY_SETTINGS,
        role: "admin",
        prefetch: prefetchSsoProviders,
      },
      {
        label: "Billing",
        icon: IconCoin,
        path: "/settings/billing",
        role: "admin",
        env: "cloud",
        prefetch: prefetchBilling,
      },
      {
        label: "License",
        icon: IconLicense,
        path: "/settings/license",
        role: "admin",
        env: "selfhosted",
      },
      {
        label: "Activity log",
        icon: IconHistory,
        path: "/settings/audit",
        keywords: "audit history who changed",
        feature: Feature.AUDIT_LOGS,
        role: "owner",
        env: "selfhosted",
        prefetch: prefetchAuditLogs,
      },
    ],
  },
  {
    heading: "Applications",
    items: [
      {
        label: "ConqrHub",
        icon: IconBook,
        path: "/settings/apps/hub",
        keywords:
          "templates verified pages documentation health public sharing knowledge base plan projects",
      },
      {
        label: "ConqrMeet",
        icon: IconMicrophone,
        path: "/settings/apps/meet",
        keywords: "consent recording retention transcription publish space",
        role: "admin",
      },
      {
        label: "Artificial intelligence",
        icon: IconSparkles,
        path: "/settings/ai",
        keywords: "ai provider model mcp search generative chat transcription",
        role: "admin",
      },
      {
        label: "Connections",
        icon: IconPlug,
        path: "/settings/connections",
        keywords: "integrations suite apps plan service api management keys",
        role: "admin",
      },
    ],
  },
];

/** Routes that no longer have their own rail entry, mapped to the entry that
 *  should look active when they are open. */
const PARENT_OF: [string, string][] = [
  ["/settings/groups", "/settings/members"],
  ["/settings/verifications", "/settings/apps/hub"],
  ["/settings/health", "/settings/apps/hub"],
  ["/settings/sharing", "/settings/apps/hub"],
  ["/settings/integrations", "/settings/apps/hub"],
  ["/settings/knowledge-base", "/settings/apps/hub"],
  ["/settings/api-keys", "/settings/connections"],
];

function activePath(pathname: string): string {
  const parent = PARENT_OF.find(([prefix]) => pathname.startsWith(prefix));
  return parent ? parent[1] : pathname;
}

export default function SettingsSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const [active, setActive] = useState(activePath(location.pathname));
  const [query, setQuery] = useState("");
  const { goBack } = useSettingsNavigation();
  const { isAdmin, isOwner } = useUserRole();
  const [entitlements] = useAtom(entitlementAtom);
  const [workspace] = useAtom(workspaceAtom);
  const upgradeLabel = useUpgradeLabel();
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);

  useEffect(() => {
    captureSettingsReturn(location.search);
  }, [location.search]);

  useEffect(() => {
    setActive(activePath(location.pathname));
  }, [location.pathname]);

  const origin = readSettingsReturn();

  const hasFeature = (f: string) =>
    entitlements?.features?.includes(f) ?? false;

  const canShowItem = (item: DataItem) => {
    if (item.env === "cloud" && !isCloud()) return false;
    if (item.env === "selfhosted" && isCloud()) return false;
    if (item.role === "admin" && !isAdmin) return false;
    if (item.role === "owner" && !isOwner) return false;
    return true;
  };

  const isItemDisabled = (item: DataItem) => {
    if (!item.feature) return false;
    return !hasFeature(item.feature);
  };

  const needle = query.trim().toLowerCase();
  const matches = (item: DataItem) =>
    !needle ||
    `${t(item.label)} ${item.label} ${item.keywords ?? ""}`
      .toLowerCase()
      .includes(needle);

  const visibleGroups = useMemo(
    () =>
      groupedData
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => canShowItem(item) && matches(item),
          ),
        }))
        .filter((group) => group.items.length > 0),
    [needle, isAdmin, isOwner, entitlements],
  );

  const closeMobile = () => {
    if (mobileSidebarOpened) toggleMobileSidebar();
  };

  const onBack = () => {
    if (origin.product === "ConqrMeet" && origin.url) {
      clearSettingsReturn();
      window.location.assign(origin.url);
      return;
    }
    goBack();
    closeMobile();
  };

  const menuItems = visibleGroups.map((group) => (
    <div key={group.heading}>
      <Text c="dimmed" className={classes.linkHeader}>
        {t(group.heading)}
      </Text>
      {group.items.map((item) => {
        const isDisabled = isItemDisabled(item);
        const linkElement = (
          <Link
            onMouseEnter={!isDisabled ? item.prefetch : undefined}
            className={classes.link}
            data-active={active.startsWith(item.path) || undefined}
            data-disabled={isDisabled || undefined}
            aria-current={active.startsWith(item.path) ? "page" : undefined}
            key={item.label}
            to={isDisabled ? "#" : item.path}
            onClick={(e) => {
              if (isDisabled) {
                e.preventDefault();
                return;
              }
              closeMobile();
            }}
            style={{
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            <item.icon className={classes.linkIcon} stroke={2} />
            <span>{t(item.label)}</span>
          </Link>
        );

        if (isDisabled) {
          return (
            <Tooltip
              key={item.label}
              label={upgradeLabel}
              position="right"
              withArrow
            >
              {linkElement}
            </Tooltip>
          );
        }

        return linkElement;
      })}
    </div>
  ));

  return (
    <div className={classes.navbar}>
      <Group className={classes.title} justify="flex-start" wrap="nowrap">
        <Tooltip
          label={
            origin.product === "ConqrMeet"
              ? t("Back to ConqrMeet")
              : t("Back to ConqrHub")
          }
        >
          <ActionIcon
            onClick={onBack}
            variant="transparent"
            c="gray"
            aria-label={
              origin.product === "ConqrMeet"
                ? t("Back to ConqrMeet")
                : t("Back to ConqrHub")
            }
          >
            <IconArrowLeft stroke={2} />
          </ActionIcon>
        </Tooltip>
        <div style={{ minWidth: 0 }}>
          <Text fw={500}>{t("Settings")}</Text>
          <UnstyledButton onClick={onBack} className={classes.backLink}>
            {origin.product === "ConqrMeet"
              ? t("Back to ConqrMeet")
              : t("Back to ConqrHub")}
          </UnstyledButton>
        </div>
      </Group>

      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={t("Search a setting…")}
        aria-label={t("Search a setting…")}
        leftSection={<IconSearch size={14} />}
        size="xs"
        my="sm"
      />

      <ScrollArea w="100%" style={{ flex: 1 }}>
        {menuItems.length > 0 ? (
          menuItems
        ) : (
          <Text size="sm" c="dimmed" px="xs" py="sm">
            {t("No setting matches your search.")}
          </Text>
        )}
      </ScrollArea>

      <div className={classes.company}>
        <Text size="sm" fw={500} lineClamp={1}>
          {workspace?.name}
        </Text>
        <Text size="xs" c="dimmed">
          {isOwner ? t("Owner") : isAdmin ? t("Admin") : t("Member")}
          {workspace?.memberCount
            ? ` · ${t("{{count}} members", { count: workspace.memberCount })}`
            : ""}
        </Text>
      </div>

      {isCloud() && (
        <div className={classes.text}>
          <Text
            size="sm"
            c="dimmed"
            component="a"
            href="mailto:support@conqrai.com"
          >
            support@conqrai.com
          </Text>
        </div>
      )}
    </div>
  );
}
