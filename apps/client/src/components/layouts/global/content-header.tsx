import React from "react";
import { Text, Tooltip } from "@mantine/core";
import {
  IconHome,
  IconLayoutGrid,
  IconMicrophone,
  IconSettings,
  IconSparkles,
  IconStar,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import classes from "./content-header.module.css";
import shellClasses from "./app-shell.module.css";
import { desktopSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import SidebarToggle from "@/components/ui/sidebar-toggle-button.tsx";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";

type Crumb = {
  label: string;
  icon?: React.ElementType;
  to?: string;
};

/* Longest-prefix-first map of settings routes to their sidebar labels. */
const SETTINGS_SECTIONS: [string, string][] = [
  ["/settings/account/preferences", "Preferences"],
  ["/settings/account/api-keys", "API keys"],
  ["/settings/account/profile", "Profile"],
  ["/settings/verifications", "Verified pages"],
  ["/settings/integrations", "Integrations"],
  ["/settings/workspace", "General"],
  ["/settings/api-keys", "API management"],
  ["/settings/security", "Security & SSO"],
  ["/settings/members", "Members"],
  ["/settings/sharing", "Public sharing"],
  ["/settings/billing", "Billing"],
  ["/settings/groups", "Groups"],
  ["/settings/spaces", "Spaces"],
  ["/settings/health", "Documentation health"],
  ["/settings/audit", "Audit log"],
  ["/settings/ai", "AI settings"],
];

const TOP_LEVEL: [string, Crumb][] = [
  ["/home", { label: "Home", icon: IconHome }],
  ["/spaces", { label: "Spaces", icon: IconLayoutGrid }],
  ["/favorites", { label: "Favorites", icon: IconStar }],
  ["/meetings", { label: "Meetings", icon: IconMicrophone }],
  ["/ai", { label: "AI Chat", icon: IconSparkles }],
];

function SpaceCrumbs({ pathname }: { pathname: string }) {
  const { t } = useTranslation();
  const spaceSlug = pathname.split("/")[2];
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  return (
    <Breadcrumbs
      crumbs={[
        { label: t("Spaces"), icon: IconLayoutGrid, to: "/spaces" },
        { label: space?.name ?? spaceSlug },
      ]}
    />
  );
}

function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className={classes.breadcrumbs}>
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const Icon = crumb.icon;
        const content = (
          <>
            {Icon && <Icon size={14} stroke={2} className={classes.crumbIcon} />}
            <Text component="span" className={classes.crumbLabel} lineClamp={1}>
              {crumb.label}
            </Text>
          </>
        );

        return (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && <span className={classes.separator}>/</span>}
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className={classes.crumb}>
                {content}
              </Link>
            ) : (
              <span
                className={classes.crumb}
                data-current={isLast || undefined}
              >
                {content}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Plane-style content header: a fixed breadcrumb row at the top of the
 * content card. When the sidebar is collapsed, the expand toggle docks at
 * its left — exactly where Plane puts it.
 */
export default function ContentHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const toggleDesktop = useToggleSidebar(desktopSidebarAtom);

  const pathname = location.pathname;
  const isSpaceRoute = pathname.startsWith("/s/");

  let crumbs: Crumb[] | null = null;
  if (pathname.startsWith("/settings")) {
    const section = SETTINGS_SECTIONS.find(([prefix]) =>
      pathname.startsWith(prefix),
    );
    crumbs = [
      { label: t("Settings"), icon: IconSettings },
      ...(section ? [{ label: t(section[1]) }] : []),
    ];
  } else {
    const top = TOP_LEVEL.find(([prefix]) => pathname.startsWith(prefix));
    if (top) {
      crumbs = [{ ...top[1], label: t(top[1].label) }];
    }
  }

  return (
    <div className={shellClasses.contentHeader}>
      {!desktopOpened && (
        <Tooltip label={t("Sidebar toggle")}>
          <SidebarToggle
            aria-label={t("Sidebar toggle")}
            opened={desktopOpened}
            onClick={toggleDesktop}
            visibleFrom="sm"
            size="sm"
          />
        </Tooltip>
      )}
      {isSpaceRoute ? (
        <SpaceCrumbs pathname={pathname} />
      ) : (
        crumbs && <Breadcrumbs crumbs={crumbs} />
      )}
    </div>
  );
}
