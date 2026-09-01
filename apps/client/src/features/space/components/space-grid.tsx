import { Text, SimpleGrid, Group, Button } from "@mantine/core";
import React from "react";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconArrowRight } from "@tabler/icons-react";
import StarButton from "@/features/favorite/components/star-button";
import { useFavoriteIds } from "@/features/favorite/queries/favorite-query";
import SpaceCard from "@/features/space/components/space-card.tsx";

export default function SpaceGrid() {
  const { t } = useTranslation();
  const { data, isLoading } = useGetSpacesQuery({ limit: 10 });
  const spaceFavoriteIds = useFavoriteIds("space");

  const cards = data?.items.slice(0, 6).map((space) => (
    <SpaceCard
      key={space.id}
      space={space}
      topRight={
        <div data-favorited={spaceFavoriteIds.has(space.id)}>
          <StarButton type="space" spaceId={space.id} size={16} />
        </div>
      }
    />
  ));

  return (
    <>
      <Group justify="space-between" align="center" mb="md">
        <Text fz="sm" fw={500}>
          {t("Spaces you belong to")}
        </Text>
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }}>{cards}</SimpleGrid>

      {data?.items && data.items.length > 6 && (
        <Group justify="flex-end" mt="lg">
          <Button
            component={Link}
            to="/spaces"
            variant="subtle"
            rightSection={<IconArrowRight size={16} />}
            size="sm"
          >
            {t("View all spaces")}
          </Button>
        </Group>
      )}
    </>
  );
}
