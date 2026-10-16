import { Group, Table, Avatar, Text, Alert, Badge } from "@mantine/core";
import { useWorkspaceInvitationsQuery } from "@/features/workspace/queries/workspace-query.ts";
import React from "react";
import { getUserRoleLabel } from "@/features/workspace/types/user-role-data.ts";
import InviteActionMenu from "@/features/workspace/components/members/components/invite-action-menu.tsx";
import { IconInfoCircle } from "@tabler/icons-react";
import { timeAgo } from "@/lib/time.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate.tsx";
import { useCursorPaginate } from "@/hooks/use-cursor-paginate";

function InvitationExpiry({
  expiresAt,
}: {
  expiresAt?: Date | string | null;
}) {
  const { t, i18n } = useTranslation();
  if (!expiresAt) return <Text fz="sm">—</Text>;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return <Text fz="sm">—</Text>;
  if (at.getTime() <= Date.now()) {
    return (
      <Badge color="red" variant="light">
        {t("Expired")}
      </Badge>
    );
  }
  const date = at.toLocaleDateString(i18n.language || undefined, {
    day: "numeric",
    month: "short",
  });
  return <Text fz="sm">{t("Until {{date}}", { date })}</Text>;
}

export default function WorkspaceInvitesTable() {
  const { t } = useTranslation();
  const { cursor, goNext, goPrev } = useCursorPaginate();
  const { data, isLoading } = useWorkspaceInvitationsQuery({
    cursor,
    limit: 100,
  });
  const { isAdmin } = useUserRole();

  return (
    <>
      <Alert variant="light" color="blue" icon={<IconInfoCircle />}>
        {t(
          "Invited members who are yet to accept their invitation will appear here.",
        )}{" "}
        {t(
          "An invitation link is valid for 7 days; resending the invitation or copying its link gives it 7 more days.",
        )}
      </Alert>

      <Table.ScrollContainer minWidth={600}>
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Email")}</Table.Th>
              <Table.Th>{t("Role")}</Table.Th>
              <Table.Th>{t("Date")}</Table.Th>
              <Table.Th>{t("Expiry")}</Table.Th>
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {data?.items.map((invitation, index) => (
              <Table.Tr key={index}>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <Avatar name={invitation.email} color="initials" />
                    <div>
                      <Text fz="sm" fw={500}>
                        {invitation.email}
                      </Text>
                    </div>
                  </Group>
                </Table.Td>

                <Table.Td>{t(getUserRoleLabel(invitation.role))}</Table.Td>

                <Table.Td>{timeAgo(invitation.createdAt)}</Table.Td>

                <Table.Td>
                  <InvitationExpiry expiresAt={invitation.expiresAt} />
                </Table.Td>

                <Table.Td>
                  {isAdmin && <InviteActionMenu invitationId={invitation.id} />}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data?.items.length > 0 && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
