import {
  ActionIcon,
  Anchor,
  Badge,
  Card,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArchive,
  IconDots,
  IconEdit,
  IconSend,
  IconThumbDown,
  IconThumbDownFilled,
  IconThumbUp,
  IconThumbUpFilled,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IInsight, InsightVote } from "../types/expertise.types";
import {
  useDeleteInsightMutation,
  usePublishInsightMutation,
  useRetireInsightMutation,
  useVoteInsightMutation,
} from "../queries/expertise-query";
import {
  CONFIDENCE_LABELS,
  INSIGHT_TYPE_COLORS,
  INSIGHT_TYPE_LABELS,
  STATUS_LABELS,
} from "./insight-labels";
import { formatDateFr } from "./format-date";

type Props = {
  insight: IInsight;
  myVote: InsightVote | null;
  canManage: boolean;
  onEdit?: (insight: IInsight) => void;
  /** Link to the page the insight is about (directory view). */
  page?: { title: string; url: string; spaceName?: string };
  compact?: boolean;
};

export function InsightCard({
  insight,
  myVote,
  canManage,
  onEdit,
  page,
  compact,
}: Props) {
  const { t } = useTranslation();
  const publish = usePublishInsightMutation();
  const retire = useRetireInsightMutation();
  const remove = useDeleteInsightMutation();
  const vote = useVoteInsightMutation();

  const castVote = (kind: InsightVote) =>
    vote.mutate({
      insightId: insight.id,
      vote: myVote === kind ? null : kind,
    });

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t("Delete this insight?"),
      centered: true,
      children: (
        <Text size="sm">{t("It disappears for every reader. This cannot be undone.")}</Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => remove.mutate(insight.id),
    });

  const author = [insight.authorName, insight.authorDepartment]
    .filter(Boolean)
    .join(" · ");
  const date = insight.publishedAt ?? insight.createdAt;

  return (
    <Card withBorder radius="md" padding={compact ? "sm" : "md"}>
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Group gap={6} wrap="wrap">
            <Badge
              size="sm"
              variant="light"
              color={INSIGHT_TYPE_COLORS[insight.insightType]}
            >
              {t(INSIGHT_TYPE_LABELS[insight.insightType])}
            </Badge>
            {insight.status !== "published" && (
              <Badge size="sm" variant="outline" color="gray">
                {t(STATUS_LABELS[insight.status])}
              </Badge>
            )}
            <Text size="xs" c="dimmed">
              {t(CONFIDENCE_LABELS[insight.confidence])}
            </Text>
          </Group>

          {canManage && (
            <Menu position="bottom-end" withArrow shadow="md">
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label={t("Insight actions")}
                >
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {insight.status === "draft" && (
                  <>
                    <Menu.Item
                      leftSection={<IconEdit size={14} />}
                      onClick={() => onEdit?.(insight)}
                    >
                      {t("Edit")}
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<IconSend size={14} />}
                      onClick={() => publish.mutate(insight.id)}
                    >
                      {t("Publish")}
                    </Menu.Item>
                  </>
                )}
                {insight.status === "published" && (
                  <Menu.Item
                    leftSection={<IconArchive size={14} />}
                    onClick={() => retire.mutate(insight.id)}
                  >
                    {t("Retire")}
                  </Menu.Item>
                )}
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={confirmDelete}
                >
                  {t("Delete")}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>

        <Text fw={600} size={compact ? "sm" : "md"}>
          {insight.title}
        </Text>
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }} lineClamp={compact ? 6 : undefined}>
          {insight.body}
        </Text>

        {page && (
          <Text size="xs" c="dimmed">
            {page.spaceName ? `${page.spaceName} › ` : ""}
            <Anchor component={Link} to={page.url} size="xs">
              {page.title}
            </Anchor>
          </Text>
        )}

        <Group justify="space-between" wrap="nowrap" mt={2}>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {author ? `${author} · ` : ""}
            {formatDateFr(date)}
            {insight.expiresAt
              ? ` · ${t("valid until {{date}}", { date: formatDateFr(insight.expiresAt) })}`
              : ""}
          </Text>

          {insight.status === "published" && (
            <Group gap={2} wrap="nowrap">
              <Tooltip label={t("Helpful")} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={myVote === "helpful" ? "teal" : "gray"}
                  size="sm"
                  onClick={() => castVote("helpful")}
                  loading={vote.isPending}
                  aria-label={t("Helpful")}
                  aria-pressed={myVote === "helpful"}
                >
                  {myVote === "helpful" ? (
                    <IconThumbUpFilled size={14} />
                  ) : (
                    <IconThumbUp size={14} />
                  )}
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed" w={18}>
                {insight.helpfulCount}
              </Text>
              <Tooltip label={t("Not helpful")} withArrow>
                <ActionIcon
                  variant="subtle"
                  color={myVote === "not_helpful" ? "red" : "gray"}
                  size="sm"
                  onClick={() => castVote("not_helpful")}
                  loading={vote.isPending}
                  aria-label={t("Not helpful")}
                  aria-pressed={myVote === "not_helpful"}
                >
                  {myVote === "not_helpful" ? (
                    <IconThumbDownFilled size={14} />
                  ) : (
                    <IconThumbDown size={14} />
                  )}
                </ActionIcon>
              </Tooltip>
              <Text size="xs" c="dimmed" w={18}>
                {insight.notHelpfulCount}
              </Text>
            </Group>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
