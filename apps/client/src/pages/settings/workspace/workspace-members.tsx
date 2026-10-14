import WorkspaceInviteModal from "@/features/workspace/components/members/components/workspace-invite-modal";
import { Alert, Group, SegmentedControl, Space } from "@mantine/core";
import WorkspaceMembersTable from "@/features/workspace/components/members/components/workspace-members-table";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import WorkspaceInvitesTable from "@/features/workspace/components/members/components/workspace-invites-table.tsx";
import GroupList from "@/features/group/components/group-list";
import CreateGroupModal from "@/features/group/components/create-group-modal";
import useUserRole from "@/hooks/use-user-role.tsx";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { IconInfoCircle } from "@tabler/icons-react";

type Tab = "members" | "groups" | "invites";
const TABS: Tab[] = ["members", "groups", "invites"];

/**
 * Paramètres › Entreprise › Membres et groupes: members, groups and pending
 * invitations were three pages; they are three tabs of one page. The old
 * /settings/groups route lands on the Groups tab.
 */
export default function WorkspaceMembers() {
  const { t } = useTranslation();
  const [segmentValue, setSegmentValue] = useState<Tab>("members");
  const [workspace] = useAtom(workspaceAtom);
  const [searchParams] = useSearchParams();
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();

  useEffect(() => {
    const currentTab = searchParams.get("tab");
    setSegmentValue(
      TABS.includes(currentTab as Tab) ? (currentTab as Tab) : "members",
    );
  }, [searchParams.get("tab")]);

  const handleSegmentChange = (value: string) => {
    setSegmentValue(value as Tab);
    if (value !== "members") {
      navigate(`?tab=${value}`);
    } else {
      navigate("");
    }
  };

  return (
    <>
      <Helmet>
        <title>
          {t("Members and groups")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle
        title={t("Members and groups")}
        description={t(
          "Who has access, with which role, and how members are grouped.",
        )}
        scope="company"
      />

      <Group justify="space-between">
        <SegmentedControl
          value={segmentValue}
          onChange={handleSegmentChange}
          data={[
            {
              label: t("Members") + ` (${workspace?.memberCount})`,
              value: "members",
            },
            { label: t("Groups"), value: "groups" },
            { label: t("Pending"), value: "invites" },
          ]}
          withItemsBorders={false}
        />

        {isAdmin && segmentValue === "groups" && <CreateGroupModal />}
        {isAdmin && segmentValue !== "groups" && <WorkspaceInviteModal />}
      </Group>

      <Space h="lg" />

      {segmentValue === "invites" && <WorkspaceInvitesTable />}
      {segmentValue === "groups" && <GroupList />}
      {segmentValue === "members" && (
        <>
          <WorkspaceMembersTable />
          <Alert
            icon={<IconInfoCircle size={16} />}
            color="blue"
            variant="light"
            mt="lg"
          >
            {t(
              "Owner: manages billing, security and every space. Admin: manages members and applications. Member: uses the spaces they are invited to.",
            )}
          </Alert>
        </>
      )}
    </>
  );
}
