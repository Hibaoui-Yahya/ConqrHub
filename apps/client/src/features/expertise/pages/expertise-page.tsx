import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import {
  Center,
  Container,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconBulb, IconSearch } from "@tabler/icons-react";
import { getAppName } from "@/lib/config.ts";
import { buildPageUrl } from "@/features/page/page.utils";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { useInsightSearchQuery } from "../queries/expertise-query";
import { IInsight, InsightStatus } from "../types/expertise.types";
import { InsightCard } from "../components/insight-card";
import { InsightFormModal } from "../components/insight-form-modal";

/**
 * "Expertise": every expert insight the person can read, across spaces.
 * Insights are written from the page they are about (side panel of the
 * page); here they are found, rated, and managed by the space experts.
 */
export default function ExpertisePage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 300);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<InsightStatus | "any">("published");
  const [editing, setEditing] = useState<IInsight | null>(null);

  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const { data: items, isLoading, isFetching } = useInsightSearchQuery({
    query: debounced.trim() || undefined,
    spaceId: spaceId ?? undefined,
    status: status === "any" ? undefined : status,
  });

  return (
    <>
      <Helmet>
        <title>
          {t("Expertise")} - {getAppName()}
        </title>
      </Helmet>

      <Container size={1000} pt="xl" pb="xl">
        <Stack gap={4} mb="lg">
          <Group gap="xs">
            <IconBulb size={22} />
            <Title order={3}>{t("Expertise")}</Title>
          </Group>
          <Text size="sm" c="dimmed">
            {t(
              "Warnings, corrections and advice that experts attached to pages. Add one from the Expertise panel of a page.",
            )}
          </Text>
        </Stack>

        <Group mb="lg" gap="sm" wrap="wrap">
          <TextInput
            placeholder={t("Search insights, authors, departments")}
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            rightSection={isFetching ? <Loader size="xs" /> : null}
            style={{ flex: 1, minWidth: 220 }}
            aria-label={t("Search")}
          />
          <Select
            data={[
              { value: "", label: t("All spaces") },
              ...(spaces?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={spaceId ?? ""}
            onChange={(v) => setSpaceId(v || null)}
            searchable
            w={200}
            aria-label={t("Space")}
          />
          <Select
            data={[
              { value: "published", label: t("Published") },
              { value: "draft", label: t("Drafts") },
              { value: "retired", label: t("Retired") },
              { value: "any", label: t("All states") },
            ]}
            value={status}
            onChange={(v) => v && setStatus(v as InsightStatus | "any")}
            allowDeselect={false}
            w={160}
            aria-label={t("Status")}
          />
        </Group>

        {isLoading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : (items ?? []).length === 0 ? (
          <Center py="xl">
            <Text c="dimmed" size="sm">
              {debounced.trim()
                ? t("No insight matches this search.")
                : t("No expert insight yet.")}
            </Text>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {(items ?? []).map((item) => (
              <InsightCard
                key={item.id}
                insight={item}
                myVote={item.myVote}
                canManage={item.canManage}
                onEdit={setEditing}
                page={{
                  title: item.pageTitle || t("Untitled"),
                  url: buildPageUrl(item.spaceSlug, item.pageSlugId, item.pageTitle ?? ""),
                  spaceName: item.spaceName,
                }}
              />
            ))}
          </SimpleGrid>
        )}
      </Container>

      <InsightFormModal
        opened={!!editing}
        onClose={() => setEditing(null)}
        insight={editing}
      />
    </>
  );
}
