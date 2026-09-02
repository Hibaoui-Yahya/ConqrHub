import { Box, SimpleGrid, Space } from "@mantine/core";
import { ISpace } from "@/features/space/types/space.types.ts";
import SpaceCard from "@/features/space/components/space-card.tsx";
import StarButton from "@/features/favorite/components/star-button";
import { SearchInput } from "@/components/common/search-input";
import Paginate from "@/components/common/paginate";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { IconLayoutGrid } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface AllSpacesGridProps {
  spaces: ISpace[];
  onSearch: (value: string) => void;
  hasPrevPage?: boolean;
  hasNextPage?: boolean;
  onNext: () => void;
  onPrev: () => void;
}

/**
 * Plane's projects gallery (card-list.tsx: grid-cols-1 md:2 lg:3) as the
 * alternate layout for the all-spaces surface. Same search + pagination
 * controls as the list view.
 */
export default function AllSpacesGrid({
  spaces,
  onSearch,
  hasPrevPage,
  hasNextPage,
  onNext,
  onPrev,
}: AllSpacesGridProps) {
  const { t } = useTranslation();

  return (
    <Box>
      <SearchInput onSearch={onSearch} />

      <Space h="md" />

      {spaces.length > 0 ? (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="lg">
          {spaces.map((space) => (
            <SpaceCard
              key={space.id}
              space={space}
              topRight={
                <StarButton type="space" spaceId={space.id} size={16} />
              }
            />
          ))}
        </SimpleGrid>
      ) : (
        <EmptyState
          icon={IconLayoutGrid}
          title={t("No spaces found")}
          description={t("Try a different search.")}
        />
      )}

      {spaces.length > 0 && (
        <Paginate
          hasPrevPage={hasPrevPage}
          hasNextPage={hasNextPage}
          onNext={onNext}
          onPrev={onPrev}
        />
      )}
    </Box>
  );
}
