import { AppShell, Container } from "@mantine/core";
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import SettingsSidebar from "@/components/settings/settings-sidebar.tsx";
import { useAtom } from "jotai";
import {
  asideStateAtom,
  desktopSidebarAtom,
  mobileSidebarAtom,
  sidebarWidthAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { SpaceSidebar } from "@/features/space/components/sidebar/space-sidebar.tsx";
import AiChatSidebar from "@/ee/ai-chat/components/ai-chat-sidebar.tsx";
import { AppHeader } from "@/components/layouts/global/app-header.tsx";
import Aside from "@/components/layouts/global/aside.tsx";
import classes from "./app-shell.module.css";
import { useTrialEndAction } from "@/ee/hooks/use-trial-end-action.tsx";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import GlobalSidebar from "@/components/layouts/global/global-sidebar.tsx";
import ContentHeader from "@/components/layouts/global/content-header.tsx";
import SidebarToggle from "@/components/ui/sidebar-toggle-button.tsx";
import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";

export default function GlobalAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  useTrialEndAction();
  const { t } = useTranslation();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);
  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const toggleDesktop = useToggleSidebar(desktopSidebarAtom);
  const [{ isAsideOpen }] = useAtom(asideStateAtom);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  const startResizing = React.useCallback((mouseDownEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        const newWidth =
          mouseMoveEvent.clientX -
          sidebarRef.current.getBoundingClientRect().left;
        if (newWidth < 220) {
          setSidebarWidth(220);
          return;
        }
        if (newWidth > 600) {
          setSidebarWidth(600);
          return;
        }
        setSidebarWidth(newWidth);
      }
    },
    [isResizing],
  );

  useEffect(() => {
    //https://codesandbox.io/p/sandbox/kz9de
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/settings");
  const isSpaceRoute = location.pathname.startsWith("/s/");
  const isAiRoute = location.pathname.startsWith("/ai");
  const isPageRoute = location.pathname.includes("/p/");
  const showGlobalSidebar = !isSpaceRoute && !isSettingsRoute && !isAiRoute;

  return (
    <AppShell
      header={{ height: 40 }}
      navbar={{
        width: isSpaceRoute ? sidebarWidth : 300,
        breakpoint: "sm",
        collapsed: {
          mobile: !mobileOpened,
          desktop: !desktopOpened,
        },
      }}
      aside={
        isPageRoute && {
          width: 350,
          breakpoint: "sm",
          collapsed: { mobile: !isAsideOpen, desktop: !isAsideOpen },
        }
      }
      padding={0}
    >
      <AppShell.Header px="md" className={classes.header} withBorder={false}>
        <AppHeader />
      </AppShell.Header>
      <AppShell.Navbar
        className={classes.navbar}
        withBorder={false}
        ref={sidebarRef}
      >
        {/* Plane-style workspace card: the sidebar is the card's left half. */}
        <div className={classes.navbarCard}>
          {/* Plane keeps the collapse toggle in the sidebar's top row,
              right-aligned — not in the app header. */}
          <Tooltip label={t("Sidebar toggle")}>
            <SidebarToggle
              aria-label={t("Sidebar toggle")}
              opened={desktopOpened}
              onClick={toggleDesktop}
              visibleFrom="sm"
              size="sm"
              className={classes.sidebarCollapse}
            />
          </Tooltip>
          {isSpaceRoute && (
            <div className={classes.resizeHandle} onMouseDown={startResizing} />
          )}
          {isSpaceRoute && <SpaceSidebar />}
          {isSettingsRoute && <SettingsSidebar />}
          {isAiRoute && <AiChatSidebar />}
          {showGlobalSidebar && <GlobalSidebar />}
        </div>
      </AppShell.Navbar>
      <AppShell.Main className={classes.main}>
        <div
          className={
            desktopOpened
              ? classes.mainCard
              : `${classes.mainCard} ${classes.mainCardFull}`
          }
        >
          {/* Page routes carry their own breadcrumb header (page-header). */}
          {!isPageRoute && <ContentHeader />}
          <div className={classes.mainCardBody}>
            {isSettingsRoute ? (
              <Container size={900}>{children}</Container>
            ) : (
              children
            )}
          </div>
        </div>
      </AppShell.Main>

      {isPageRoute && (
        <AppShell.Aside className={classes.aside} withBorder={false}>
          <div className={classes.asideCard}>
            <Aside />
          </div>
        </AppShell.Aside>
      )}
    </AppShell>
  );
}
