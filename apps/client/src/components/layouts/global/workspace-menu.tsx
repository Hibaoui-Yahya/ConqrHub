import { Avatar, Divider, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import {
  IconCheck,
  IconChevronDown,
  IconCirclePlus,
  IconLogout,
  IconSettings,
  IconUserPlus,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import useAuth from "@/features/auth/hooks/use-auth.ts";
import APP_ROUTE from "@/lib/app-route.ts";
import { isCloud } from "@/lib/config.ts";
import classes from "./workspace-menu.module.css";

type WorkspaceMenuProps = {
  /** Opens the invite modal in place (falls back to the members page). */
  onInvite?: () => void;
};

/**
 * Workspace menu anchored at the sidebar bottom — the same element Plane
 * shows (workspace avatar + name, then: email, workspace row with
 * role/member count, Settings / Invite members, Create workspace (cloud),
 * Sign out). Opens upward from the bottom of the sidebar.
 */
export default function WorkspaceMenu({ onInvite }: WorkspaceMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [currentUser] = useAtom(currentUserAtom);

  const workspace = currentUser?.workspace;
  const user = currentUser?.user;
  if (!workspace) return null;

  const initial = (workspace.name ?? "C").charAt(0).toUpperCase();
  const memberCount = workspace.memberCount;

  return (
    <Menu position="top-start" width={280} shadow="lg" withinPortal>
      <Menu.Target>
        <UnstyledButton className={classes.trigger} aria-label={t("Workspace menu")}>
          <Avatar color="brand" variant="filled" radius="sm" size={22}>
            {initial}
          </Avatar>
          <Text size="sm" fw={600} truncate className={classes.name}>
            {workspace.name}
          </Text>
          <IconChevronDown size={14} className={classes.chevron} />
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        {user?.email && (
          <Text size="xs" c="dimmed" px="sm" pt={6} pb={4} truncate>
            {user.email}
          </Text>
        )}

        <div className={classes.workspaceRow}>
          <Avatar color="brand" variant="filled" radius="sm" size={30}>
            {initial}
          </Avatar>
          <div className={classes.workspaceInfo}>
            <Text size="sm" fw={600} truncate>
              {workspace.name}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {[user?.role, memberCount ? `${memberCount} ${memberCount === 1 ? t("Member") : t("Members")}` : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </div>
          <IconCheck size={16} className={classes.check} />
        </div>

        <Group gap={6} px="sm" pb={8} grow>
          <UnstyledButton
            className={classes.pillButton}
            onClick={() => navigate(APP_ROUTE.SETTINGS.WORKSPACE.GENERAL)}
          >
            <IconSettings size={14} />
            {t("Settings")}
          </UnstyledButton>
          <UnstyledButton
            className={classes.pillButton}
            onClick={() =>
              onInvite ? onInvite() : navigate(APP_ROUTE.SETTINGS.WORKSPACE.MEMBERS)
            }
          >
            <IconUserPlus size={14} />
            {t("Invite members")}
          </UnstyledButton>
        </Group>

        <Divider />

        {isCloud() && (
          <Menu.Item
            leftSection={<IconCirclePlus size={16} />}
            onClick={() => navigate(APP_ROUTE.AUTH.CREATE_WORKSPACE)}
          >
            {t("Create workspace")}
          </Menu.Item>
        )}
        <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
          {t("Sign out")}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
