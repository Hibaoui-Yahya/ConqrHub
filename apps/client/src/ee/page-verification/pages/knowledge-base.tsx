import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Group,
  List,
  Progress,
  Select,
  SimpleGrid,
  Skeleton,
  Space,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  IconAlertTriangle,
  IconClockExclamation,
  IconProgressCheck,
  IconSearch,
  IconShieldCheck,
  IconShieldX,
} from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title";
import { getAppName } from "@/lib/config";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import {
  useBulkVerifyMutation,
  useUnverifiedPagesInfiniteQuery,
  useVerificationOverviewQuery,
} from "@/ee/page-verification/queries/page-verification-query";
import UnverifiedPagesTable from "@/ee/page-verification/components/unverified-pages-table";
import { getBulkVerifyReasonLabel } from "@/ee/page-verification/components/verification-status";

const PAGE_SIZE = 50;

/** Validity options for bulk verification; "0" means indefinite. */
const VALIDITY_OPTIONS = [
  { value: "0", key: "Indefinite" },
  { value: "30", key: "30 days" },
  { value: "90", key: "90 days" },
  { value: "365", key: "1 year" },
];

type StatCardProps = {
  label: string;
  value: number | undefined;
  color: string;
  icon: React.ReactNode;
  loading: boolean;
};

function StatCard({ label, value, color, icon, loading }: StatCardProps) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color={color} size={36} radius="md">
          {icon}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          {loading ? (
            <Skeleton height={26} width={48} mb={4} />
          ) : (
            <Text fz={24} fw={650} lh={1.1}>
              {value ?? 0}
            </Text>
          )}
          <Text fz="xs" c="dimmed" lineClamp={1}>
            {label}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

export default function KnowledgeBasePage() {
  const { t, i18n } = useTranslation();

  const [searchValue, setSearchValue] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchValue, 300);
  const [spaceFilter, setSpaceFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [validity, setValidity] = useState<string>("0");
  const [failures, setFailures] = useState<{ pageId: string; reason: string }[]>(
    [],
  );

  const overviewQuery = useVerificationOverviewQuery();
  const overview = overviewQuery.data;

  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });
  const spaceOptions = useMemo(
    () =>
      spacesData?.items?.map((space) => ({
        value: space.id,
        label: space.name,
      })) ?? [],
    [spacesData],
  );

  const unverifiedParams = useMemo(
    () => ({
      spaceId: spaceFilter || undefined,
      query: debouncedSearch || undefined,
      limit: PAGE_SIZE,
    }),
    [spaceFilter, debouncedSearch],
  );
  const unverifiedQuery = useUnverifiedPagesInfiniteQuery(unverifiedParams);
  const items = useMemo(
    () => unverifiedQuery.data?.pages.flatMap((p) => p?.items ?? []) ?? [],
    [unverifiedQuery.data],
  );
  const itemsById = useMemo(
    () => new Map(items.map((p) => [p.id, p] as const)),
    [items],
  );

  const bulkVerify = useBulkVerifyMutation();

  const handleToggle = useCallback((pageId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(pageId);
      else next.delete(pageId);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(items.map((p) => p.id)) : new Set());
    },
    [items],
  );

  const handleSpaceChange = (value: string | null) => {
    setSpaceFilter(value);
    setSelectedIds(new Set());
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.currentTarget.value);
  };

  const handleVerifySelection = () => {
    const pageIds = Array.from(selectedIds);
    if (pageIds.length === 0) return;
    const days = Number(validity);
    bulkVerify.mutate(
      { pageIds, ...(days > 0 ? { expiresInDays: days } : {}) },
      {
        onSuccess: (result) => {
          const failed = result?.failed ?? [];
          setFailures(failed);
          // Keep only the failed pages selected so the user can retry them.
          setSelectedIds(new Set(failed.map((f) => f.pageId)));
        },
      },
    );
  };

  const selectedCount = selectedIds.size;
  const lastIndexed = overview?.lastIndexedAt
    ? new Date(overview.lastIndexedAt)
    : null;
  const lastIndexedText =
    lastIndexed && !isNaN(lastIndexed.getTime())
      ? lastIndexed.toLocaleString(i18n.language || undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  return (
    <>
      <Helmet>
        <title>
          {t("AI knowledge base")} - {getAppName()}
        </title>
      </Helmet>

      <SettingsTitle title={t("AI knowledge base")} />

      <Text fz="sm" c="dimmed" mb="md" maw={720}>
        {t(
          "Ask AI only searches verified pages. Verify the pages your team relies on so the assistant can cite them; a page edited after its verification leaves the knowledge base until it is verified again.",
        )}
        {lastIndexedText && (
          <>
            {" "}
            {t("Last indexed: {{date}}", { date: lastIndexedText })}
          </>
        )}
      </Text>

      {overviewQuery.isError && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          mb="md"
        >
          {t("Could not load the knowledge base overview.")}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mb="xl">
        <StatCard
          label={t("Verified")}
          value={overview?.verified}
          color="teal"
          icon={<IconShieldCheck size={20} />}
          loading={overviewQuery.isLoading}
        />
        <StatCard
          label={t("To verify")}
          value={overview?.unverified}
          color="gray"
          icon={<IconProgressCheck size={20} />}
          loading={overviewQuery.isLoading}
        />
        <StatCard
          label={t("Expiring soon")}
          value={overview?.expiring}
          color="orange"
          icon={<IconClockExclamation size={20} />}
          loading={overviewQuery.isLoading}
        />
        <StatCard
          label={t("Expired")}
          value={overview?.expired}
          color="red"
          icon={<IconShieldX size={20} />}
          loading={overviewQuery.isLoading}
        />
      </SimpleGrid>

      <Title order={5} mb="xs">
        {t("Coverage by space")}
      </Title>
      <Table.ScrollContainer minWidth={520}>
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Space")}</Table.Th>
              <Table.Th ta="right" w={80}>
                {t("Total")}
              </Table.Th>
              <Table.Th ta="right" w={90}>
                {t("Verified")}
              </Table.Th>
              <Table.Th ta="right" w={90}>
                {t("To verify")}
              </Table.Th>
              <Table.Th w={200}>{t("Progress")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {overviewQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Skeleton height={14} width={140} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={14} width={30} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={14} width={30} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={14} width={30} />
                  </Table.Td>
                  <Table.Td>
                    <Skeleton height={8} width={160} />
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (overview?.spaces?.length ?? 0) > 0 ? (
              overview!.spaces.map((s) => {
                const pct =
                  s.total > 0 ? Math.round((s.verified / s.total) * 100) : 0;
                return (
                  <Table.Tr key={s.spaceId}>
                    <Table.Td>
                      <Text fz="sm" fw={500} lineClamp={1}>
                        {s.spaceName}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm">{s.total}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="teal">
                        {s.verified}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c={s.unverified > 0 ? "orange" : "dimmed"}>
                        {s.unverified}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Progress
                          value={pct}
                          size="sm"
                          radius="xl"
                          color={pct === 100 ? "teal" : pct >= 50 ? "blue" : "orange"}
                          style={{ flex: 1 }}
                          aria-label={t("{{percent}}% verified", { percent: pct })}
                        />
                        <Text fz="xs" c="dimmed" w={36} ta="right">
                          {pct}%
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })
            ) : (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text fz="sm" c="dimmed" ta="center" py="md">
                    {t("No space yet.")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Space h="xl" />

      <Title order={5} mb="xs">
        {t("Pages to verify")}
      </Title>

      <Group mb="sm" gap="sm" align="flex-end">
        <TextInput
          placeholder={t("Search by title")}
          leftSection={<IconSearch size={16} />}
          value={searchValue}
          onChange={handleSearchChange}
          size="sm"
          w={220}
        />
        <Select
          placeholder={t("Filter by space")}
          data={spaceOptions}
          value={spaceFilter}
          onChange={handleSpaceChange}
          clearable
          searchable
          w={220}
          size="sm"
        />
        <div style={{ flex: 1 }} />
        <Select
          aria-label={t("Validity")}
          data={VALIDITY_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))}
          value={validity}
          onChange={(v) => setValidity(v ?? "0")}
          allowDeselect={false}
          w={150}
          size="sm"
        />
        <Button
          size="sm"
          leftSection={<IconShieldCheck size={16} />}
          disabled={selectedCount === 0}
          loading={bulkVerify.isPending}
          onClick={handleVerifySelection}
        >
          {selectedCount > 0
            ? t("Verify the selection ({{count}})", { count: selectedCount })
            : t("Verify the selection")}
        </Button>
      </Group>

      {failures.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          title={t("{{count}} page(s) could not be verified", {
            count: failures.length,
          })}
          withCloseButton
          onClose={() => setFailures([])}
          mb="sm"
        >
          <List size="sm" spacing={2}>
            {failures.map((f) => (
              <List.Item key={f.pageId}>
                <Text fz="sm" span fw={500}>
                  {itemsById.get(f.pageId)?.title || t("Untitled")}
                </Text>
                <Text fz="sm" span c="dimmed">
                  {" "}
                  — {getBulkVerifyReasonLabel(f.reason, t)}
                </Text>
              </List.Item>
            ))}
          </List>
        </Alert>
      )}

      {unverifiedQuery.isError && (
        <Alert
          color="red"
          variant="light"
          icon={<IconAlertTriangle size={16} />}
          mb="sm"
        >
          {t("Could not load the pages to verify.")}
        </Alert>
      )}

      <UnverifiedPagesTable
        items={items}
        isLoading={unverifiedQuery.isLoading}
        selectedIds={selectedIds}
        onToggle={handleToggle}
        onToggleAll={handleToggleAll}
        emptyText={
          debouncedSearch || spaceFilter
            ? undefined
            : t("Every page is verified. Nothing to do.")
        }
      />

      <Stack align="center" mt="md">
        {unverifiedQuery.hasNextPage && (
          <Button
            variant="default"
            size="sm"
            loading={unverifiedQuery.isFetchingNextPage}
            onClick={() => unverifiedQuery.fetchNextPage()}
          >
            {t("Load more")}
          </Button>
        )}
      </Stack>
    </>
  );
}
