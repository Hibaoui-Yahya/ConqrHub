import {
  Container,
  Title,
  Text,
  Group,
  Box,
  SegmentedControl,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconLayoutGrid, IconList } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import CreateSpaceModal from "@/features/space/components/create-space-modal";
import { AllSpacesList } from "@/features/space/components/spaces-page";
import FavoriteSpacesGrid from "@/features/space/components/spaces-page/favorite-spaces-grid";
import AllSpacesGrid from "@/features/space/components/spaces-page/all-spaces-grid";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search";
import useUserRole from "@/hooks/use-user-role";

export default function Spaces() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { search, cursor, goNext, goPrev, handleSearch } =
    usePaginateAndSearch();
  const [layout, setLayout] = useLocalStorage<"grid" | "list">({
    key: "spaces-layout",
    defaultValue: "grid",
  });

  const { data, isLoading } = useGetSpacesQuery({
    cursor,
    limit: 30,
    query: search,
  });

  return (
    <>
      <Helmet>
        <title>
          {t("Spaces")} - {getAppName()}
        </title>
      </Helmet>

      <Container size={"800"} pt="xl">
        <Group justify="space-between" mb="xl">
          <Title order={3}>{t("Spaces")}</Title>
          {isAdmin && <CreateSpaceModal />}
        </Group>

        <FavoriteSpacesGrid />

        <Box>
          <Group justify="space-between" mb="md">
            <Text size="sm" c="dimmed">
              {t("All spaces")}
            </Text>
            <SegmentedControl
              size="xs"
              value={layout}
              onChange={(v) => setLayout(v as "grid" | "list")}
              data={[
                {
                  value: "grid",
                  label: (
                    <Group gap={4} wrap="nowrap">
                      <IconLayoutGrid size={14} />
                      <span>{t("Gallery")}</span>
                    </Group>
                  ),
                },
                {
                  value: "list",
                  label: (
                    <Group gap={4} wrap="nowrap">
                      <IconList size={14} />
                      <span>{t("List")}</span>
                    </Group>
                  ),
                },
              ]}
            />
          </Group>

          {layout === "grid" ? (
            <AllSpacesGrid
              spaces={data?.items || []}
              onSearch={handleSearch}
              hasPrevPage={data?.meta?.hasPrevPage}
              hasNextPage={data?.meta?.hasNextPage}
              onNext={() => goNext(data?.meta?.nextCursor)}
              onPrev={goPrev}
            />
          ) : (
            <AllSpacesList
              spaces={data?.items || []}
              onSearch={handleSearch}
              hasPrevPage={data?.meta?.hasPrevPage}
              hasNextPage={data?.meta?.hasNextPage}
              onNext={() => goNext(data?.meta?.nextCursor)}
              onPrev={goPrev}
            />
          )}
        </Box>
      </Container>
    </>
  );
}
