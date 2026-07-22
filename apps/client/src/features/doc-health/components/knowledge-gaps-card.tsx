import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconBulb,
  IconClockHour4,
  IconFilePlus,
  IconUserPlus,
} from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useKnowledgeGapsQuery } from "@/features/doc-health/queries/doc-health-query";
import {
  GapRecommendationKind,
  IGapRecommendation,
} from "@/features/doc-health/types/doc-health.types";
import { useCreatePageMutation } from "@/features/page/queries/page-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { SpaceSelect } from "@/features/space/components/sidebar/space-select";
import { ISpace } from "@/features/space/types/space.types";

const RANGES: { value: string; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
];

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

const RECOMMENDATION_ICON: Record<GapRecommendationKind, typeof IconFilePlus> = {
  create_page: IconFilePlus,
  update_outdated: IconClockHour4,
  assign_owner: IconUserPlus,
};

function navHref(rec: IGapRecommendation): string | null {
  if (rec.kind === "update_outdated" || rec.kind === "assign_owner") {
    return rec.spaceSlug && rec.pageSlugId
      ? `/s/${rec.spaceSlug}/p/${rec.pageSlugId}`
      : null;
  }
  return null;
}

function RecommendationChip({ rec }: { rec: IGapRecommendation }) {
  if (rec.kind === "create_page") {
    return <CreatePageChip rec={rec} />;
  }

  const Icon = RECOMMENDATION_ICON[rec.kind];
  const href = navHref(rec);
  return href ? (
    <Tooltip label={rec.detail} withArrow>
      <Button
        component={Link}
        to={href}
        size="compact-xs"
        variant="light"
        leftSection={<Icon size={12} />}
      >
        {rec.detail}
      </Button>
    </Tooltip>
  ) : (
    <Tooltip label={rec.detail} withArrow>
      <Badge variant="light" leftSection={<Icon size={12} />} size="sm">
        {rec.detail}
      </Badge>
    </Tooltip>
  );
}

function CreatePageChip({ rec }: { rec: IGapRecommendation }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createPageMutation = useCreatePageMutation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedSpace, setPickedSpace] = useState<ISpace | null>(null);

  const title = rec.suggestedTitle ?? "";
  const hasSuggestedSpace =
    Boolean(rec.suggestedSpaceId) && Boolean(rec.suggestedSpaceSlug);

  const create = async (spaceId: string, spaceSlug: string) => {
    // `spaceId` isn't on `IPageInput` but the server's CreatePageDto accepts
    // it, and the existing tree-create flow uses the same pattern: build a
    // typed local payload so TypeScript skips excess-property checks.
    const payload: { spaceId: string; title: string } = { spaceId, title };
    const page = await createPageMutation.mutateAsync(payload);
    navigate(buildPageUrl(spaceSlug, page.slugId, page.title));
  };

  const handleClick = async () => {
    if (hasSuggestedSpace) {
      await create(rec.suggestedSpaceId!, rec.suggestedSpaceSlug!);
      return;
    }
    setPickerOpen(true);
  };

  const handleConfirmPick = async () => {
    if (!pickedSpace) return;
    setPickerOpen(false);
    await create(pickedSpace.id, pickedSpace.slug);
    setPickedSpace(null);
  };

  const handleCancelPick = () => {
    setPickerOpen(false);
    setPickedSpace(null);
  };

  return (
    <>
      <Tooltip label={rec.detail} withArrow>
        <Button
          onClick={handleClick}
          loading={createPageMutation.isPending}
          size="compact-xs"
          variant="light"
          leftSection={<IconFilePlus size={12} />}
        >
          {rec.detail}
        </Button>
      </Tooltip>

      <Modal.Root
        opened={pickerOpen}
        onClose={handleCancelPick}
        size={500}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
        onClick={(e) => e.stopPropagation()}
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>{t("Create page")}</Modal.Title>
            <Modal.CloseButton />
          </Modal.Header>
          <Modal.Body>
            <Text mb="xs" c="dimmed" size="sm">
              {t('Pick a space for the new page titled "{{title}}".', {
                title,
              })}
            </Text>

            <SpaceSelect clearable={false} onChange={setPickedSpace} />

            <Group justify="end" mt="md">
              <Button onClick={handleCancelPick} variant="default">
                {t("Cancel")}
              </Button>
              <Button
                onClick={handleConfirmPick}
                disabled={!pickedSpace}
                loading={createPageMutation.isPending}
              >
                {t("Create")}
              </Button>
            </Group>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

export default function KnowledgeGapsCard() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);
  const { data, isLoading } = useKnowledgeGapsQuery({ days, limit: 25 });

  const items = data?.items ?? [];

  return (
    <Card withBorder padding="lg" radius="lg">
      <Stack gap="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="xs" align="center">
            <IconBulb size={18} />
            <Title order={4}>{t("Knowledge gaps")}</Title>
            {data && (
              <Tooltip
                label={t(
                  "Recurring questions in chat that suggest a missing or hard-to-find page. Scanned the last {{count}} messages.",
                  { count: data.scannedMessages },
                )}
              >
                <Badge size="xs" variant="light" color="gray">
                  {t("{{count}} scanned", { count: data.scannedMessages })}
                </Badge>
              </Tooltip>
            )}
          </Group>
          <SegmentedControl
            size="xs"
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            data={RANGES.map((r) => ({ value: r.value, label: t(r.label) }))}
          />
        </Group>
        <Text c="dimmed" size="sm">
          {t(
            "Questions users keep asking the AI assistant. Multiple askers asking the same thing usually means a page is missing or hard to find.",
          )}
        </Text>

        {isLoading ? (
          <Center h={120}>
            <Text c="dimmed" size="sm">
              {t("Looking for recurring questions…")}
            </Text>
          </Center>
        ) : items.length === 0 ? (
          <Center h={120}>
            <Text c="dimmed" size="sm" ta="center" maw={420}>
              {t(
                "No recurring questions yet. Once people ask the AI assistant similar things multiple times, they'll appear here.",
              )}
            </Text>
          </Center>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Question")}</Table.Th>
                <Table.Th style={{ width: 80 }}>{t("Asked")}</Table.Th>
                <Table.Th style={{ width: 80 }}>{t("Askers")}</Table.Th>
                <Table.Th style={{ width: 110 }}>{t("Last asked")}</Table.Th>
                <Table.Th>{t("Suggested actions")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((gap) => (
                <Table.Tr key={`${gap.sampleQuestion}-${gap.lastAskedAt}`}>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} title={gap.sampleQuestion}>
                      {gap.sampleQuestion}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="blue" size="sm">
                      {gap.occurrences}×
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {gap.uniqueAskers}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatRelative(gap.lastAskedAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="wrap">
                      {gap.recommendations.map((rec, i) => (
                        <RecommendationChip key={i} rec={rec} />
                      ))}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
