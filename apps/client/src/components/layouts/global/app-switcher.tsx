import { Box, Group, Menu, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconCheck,
  IconExternalLink,
  IconLayoutGrid,
  IconLayoutKanban,
  IconNotebook,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import classes from "./app-switcher.module.css";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { getSpacePlaneTarget } from "@/features/integration/services/integration-service.ts";

/**
 * Conqr suite app switcher — the shared-shell product switcher from the
 * integration blueprint (§7.4). One grid button opens a panel listing every
 * product in the suite, with the current app marked. Cross-app links are plain
 * URLs (each product is separately deployable); in-app links use the SPA router.
 *
 * Context preservation (§7.4): when the current Hub space maps to a Plane
 * project, the Plane tile deep-links to that project instead of Plane's home,
 * so switching keeps the user's context.
 *
 * PLANE base URL comes from PLANE_APP_URL (build-time), then legacy VITE_PLANE_URL,
 * then the local self-host proxy origin.
 */
const PLANE_URL =
  process.env.PLANE_APP_URL ||
  (import.meta as any)?.env?.VITE_PLANE_URL ||
  "http://localhost";

type SuiteApp = {
  key: string;
  name: string;
  desc: string;
  href: string;
  external: boolean;
  current?: boolean;
  icon: typeof IconNotebook;
  color: string;
};

function useSuiteApps(): SuiteApp[] {
  const location = useLocation();
  // Detect the current Hub space from the route (/s/:spaceSlug/...).
  const spaceSlug = location.pathname.match(/\/s\/([^/]+)/)?.[1];
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug ?? "");
  // Resolve the mapped Plane project deep link for context-preserving switch.
  const { data: target } = useQuery({
    queryKey: ["space-plane-target", space?.id],
    queryFn: () => getSpacePlaneTarget(space!.id),
    enabled: Boolean(space?.id),
    staleTime: 5 * 60 * 1000,
  });

  const planeHref = target?.url || PLANE_URL;
  const planeContextual = Boolean(target?.url);

  return [
    {
      key: "hub",
      name: "ConqrHub",
      desc: "Knowledge & documentation",
      href: "/home",
      external: false,
      current: true,
      icon: IconNotebook,
      color: "var(--brand-default)",
    },
    {
      key: "plane",
      name: "Plane",
      desc: planeContextual
        ? "Open this space's project"
        : "Projects & work management",
      href: planeHref,
      external: true,
      icon: IconLayoutKanban,
      color: "var(--extended-color-indigo-500, #5b57d1)",
    },
  ];
}

function AppTile({ app, onNavigate }: { app: SuiteApp; onNavigate: () => void }) {
  const inner = (
    <>
      <Box className={classes.tileIcon} style={{ background: app.color }}>
        <app.icon size={17} stroke={2} color="#fff" />
      </Box>
      <div className={classes.tileText}>
        <Group gap={6} wrap="nowrap">
          <Text className={classes.tileName}>{app.name}</Text>
          {app.external && (
            <IconExternalLink size={13} className={classes.tileExt} />
          )}
        </Group>
        <Text className={classes.tileDesc}>{app.desc}</Text>
      </div>
      {app.current && <IconCheck size={16} className={classes.tileCheck} />}
    </>
  );

  const cls = `${classes.tile} ${app.current ? classes.tileCurrent : ""}`;

  if (app.external) {
    return (
      <UnstyledButton
        component="a"
        href={app.href}
        className={cls}
        onClick={onNavigate}
      >
        {inner}
      </UnstyledButton>
    );
  }
  return (
    <UnstyledButton
      component={Link}
      to={app.href}
      className={cls}
      onClick={onNavigate}
    >
      {inner}
    </UnstyledButton>
  );
}

export default function AppSwitcher() {
  const { t } = useTranslation();
  const suiteApps = useSuiteApps();
  return (
    <Menu
      position="bottom-start"
      width={300}
      offset={6}
      radius="md"
      shadow="md"
      transitionProps={{ transition: "pop-top-left", duration: 120 }}
    >
      <Menu.Target>
        <Tooltip label={t("Switch apps")} openDelay={300} withArrow>
          <UnstyledButton className={classes.trigger} aria-label={t("Switch apps")}>
            <IconLayoutGrid size={19} stroke={2} />
          </UnstyledButton>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown className={classes.dropdown}>
        <Text className={classes.dropdownLabel}>{t("Conqr suite")}</Text>
        {suiteApps.map((app) => (
          <Menu.Item key={app.key} component="div" className={classes.menuItemReset}>
            <AppTile app={app} onNavigate={() => {}} />
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
