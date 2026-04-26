import { Badge, Card, Group, Progress, Stack, Table, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ISpaceScoreSummary } from "@/features/doc-health/types/doc-health.types";

function scoreColor(score: number | null) {
  if (score === null) return "gray";
  if (score >= 80) return "teal";
  if (score >= 60) return "yellow";
  if (score >= 40) return "orange";
  return "red";
}

interface Props {
  spaces: ISpaceScoreSummary[];
}

export default function SpaceScoresTable({ spaces }: Props) {
  const { t } = useTranslation();

  if (spaces.length === 0) {
    return (
      <Card withBorder padding="lg" radius="md">
        <Text c="dimmed">{t("No spaces yet.")}</Text>
      </Card>
    );
  }

  return (
    <Card withBorder padding={0} radius="md">
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Space")}</Table.Th>
            <Table.Th>{t("Pages")}</Table.Th>
            <Table.Th>{t("Score")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {spaces.map((space) => (
            <Table.Tr key={space.spaceId}>
              <Table.Td>
                <Group gap="xs">
                  <Text
                    component={Link}
                    to={`/s/${space.spaceSlug}`}
                    fw={500}
                  >
                    {space.spaceName ?? space.spaceSlug}
                  </Text>
                  {space.isCritical && (
                    <Badge color="red" variant="light" size="sm">
                      {t("Critical")}
                    </Badge>
                  )}
                </Group>
              </Table.Td>
              <Table.Td>{space.pageCount}</Table.Td>
              <Table.Td>
                {space.insufficientData ? (
                  <Text c="dimmed" size="sm">
                    {t("Insufficient data")}
                  </Text>
                ) : (
                  <Stack gap={2} maw={200}>
                    <Group justify="space-between">
                      <Text size="sm" fw={500}>
                        {space.score}
                      </Text>
                    </Group>
                    <Progress
                      value={space.score ?? 0}
                      color={scoreColor(space.score)}
                      size="sm"
                    />
                  </Stack>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Card>
  );
}
