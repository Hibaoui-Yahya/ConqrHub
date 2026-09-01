import { Text } from "@mantine/core";
import PageListSkeleton from "@/components/ui/page-list-skeleton";
import PageList from "@/components/common/page-list/page-list.tsx";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate } from "@/lib/time";
import { useCreatedByQuery } from "@/features/page/queries/page-query";
import { IconFiles } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSpaceUrl } from "@/lib/config";
import { useTranslation } from "react-i18next";

type Props = {
  spaceId?: string;
};

export default function CreatedByMe({ spaceId }: Props) {
  const { t } = useTranslation();
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useCreatedByQuery({ spaceId });

  const pages = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return <PageListSkeleton />;
  }

  if (isError) {
    return <Text>{t("Failed to fetch pages")}</Text>;
  }

  return pages.length > 0 ? (
    <PageList
      items={pages.map((page) => ({
        id: page.id,
        to: buildPageUrl(page?.space.slug, page.slugId, page.title),
        icon: page.icon,
        title: page.title,
        spaceName: spaceId ? undefined : page?.space.name,
        spaceTo: spaceId ? undefined : getSpaceUrl(page?.space.slug),
        date: formattedDate(page.createdAt),
      }))}
      hasNextPage={hasNextPage}
      isLoadingMore={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
    />
  ) : (
    <EmptyState
      icon={IconFiles}
      title={t("No pages yet")}
      description={t("Pages you create will show up here.")}
    />
  );
}
