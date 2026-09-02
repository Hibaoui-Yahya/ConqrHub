import { Text } from "@mantine/core";
import PageListSkeleton from "@/components/ui/page-list-skeleton";
import PageList from "@/components/common/page-list/page-list.tsx";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate } from "@/lib/time";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { IconStar } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSpaceUrl } from "@/lib/config";
import { useTranslation } from "react-i18next";

interface Props {
  spaceId?: string;
}

export default function FavoritesPages({ spaceId }: Props) {
  const { t } = useTranslation();
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useFavoritesQuery("page", spaceId);

  const favorites = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return <PageListSkeleton />;
  }

  if (isError) {
    return <Text>{t("Failed to fetch starred pages")}</Text>;
  }

  return favorites.length > 0 ? (
    <PageList
      items={favorites
        .filter((fav) => fav.page)
        .map((fav) => ({
          id: fav.id,
          to: buildPageUrl(fav.space?.slug, fav.page.slugId, fav.page.title),
          icon: fav.page.icon,
          title: fav.page.title,
          spaceName: spaceId ? undefined : fav.space?.name,
          spaceTo:
            spaceId || !fav.space ? undefined : getSpaceUrl(fav.space.slug),
          date: formattedDate(new Date(fav.createdAt)),
        }))}
      hasNextPage={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
    />
  ) : (
    <EmptyState
      icon={IconStar}
      title={t("No favorites yet")}
      description={t("Pages you star will show up here.")}
    />
  );
}
