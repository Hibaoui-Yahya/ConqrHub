import {
  ActionIcon,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Paginate from "@/components/common/paginate";
import { useHealthIssuesQuery } from "@/features/doc-health/queries/doc-health-query";
import {
  HealthIssueCategory,
  IHealthIssue,
} from "@/features/doc-health/types/doc-health.types";

const SEVERITY_COLOR: Record<IHealthIssue["severity"], string> = {
  high: "red",
  medium: "orange",
  low: "yellow",
};

interface Props {
  category: HealthIssueCategory;
  onCategoryChange: (category: HealthIssueCategory) => void;
  page: number;
  onPageChange: (page: number) => void;
  spaceId?: string;
}

export default function IssueList({
  category,
  onCategoryChange,
  page,
  onPageChange,
  spaceId,
}: Props) {
  const { t } = useTranslation();

  const { data, isLoading } = useHealthIssuesQuery({
    category,
    spaceId,
    page,
    limit: 25,
  });

  const segmentData: { label: string; value: HealthIssueCategory }[] = [
    { label: t("Outdated"), value: "outdated" },
    { label: t("No owner"), value: "missing-owner" },
    { label: t("Unverified"), value: "unverified-critical" },
    { label: t("Weak content"), value: "weak-content" },
  ];

  return (
    <Stack gap="md">
      <SegmentedControl
        value={category}
        onChange={(value) => {
          onCategoryChange(value as HealthIssueCategory);
          onPageChange(1);
        }}
        data={segmentData}
      />

      <Card withBorder padding={0} radius="md">
        {isLoading ? (
          <Center p="xl">
            <Loader size="sm" />
          </Center>
        ) : !data || data.items.length === 0 ? (
          <Center p="xl">
            <Text c="dimmed">{t("Nothing to fix here. Nice work.")}</Text>
          </Center>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Page")}</Table.Th>
                <Table.Th>{t("Space")}</Table.Th>
                <Table.Th>{t("Severity")}</Table.Th>
                <Table.Th>{t("Detail")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((issue) => (
                <Table.Tr key={issue.pageId}>
                  <Table.Td>
                    <Text fw={500} lineClamp={1}>
                      {issue.pageTitle ?? t("Untitled")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {issue.spaceName ?? issue.spaceSlug}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={SEVERITY_COLOR[issue.severity]}
                      variant="light"
                      size="sm"
                    >
                      {t(issue.severity)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{issue.detail}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end">
                      <ActionIcon
                        component={Link}
                        to={`/s/${issue.spaceSlug}/p/${issue.pageSlugId}`}
                        variant="subtle"
                        aria-label={t("Open page")}
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      {data && (data.items.length > 0 || page > 1) && (
        <Paginate
          hasPrevPage={page > 1}
          hasNextPage={data.hasMore}
          onNext={() => onPageChange(page + 1)}
          onPrev={() => onPageChange(Math.max(1, page - 1))}
        />
      )}
    </Stack>
  );
}
