import { Text, SimpleGrid, Group, Box, Button } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import StarButton from "@/features/favorite/components/star-button";
import { IconChevronDown } from "@tabler/icons-react";
import SpaceCard from "@/features/space/components/space-card.tsx";

const INITIAL_COUNT = 8;

export default function FavoriteSpacesGrid() {
  const { t } = useTranslation();
  const { data } = useFavoritesQuery("space");
  const [expanded, setExpanded] = useState(false);

  const allSpaces = (data?.pages.flatMap((p) => p.items) ?? [])
    .filter((fav) => fav.space)
    .sort((a, b) => a.space!.name.localeCompare(b.space!.name));

  if (allSpaces.length === 0) return null;

  const visibleSpaces = expanded
    ? allSpaces
    : allSpaces.slice(0, INITIAL_COUNT);

  return (
    <Box mb="xl">
      <Text size="sm" fw={500} mb="md">
        {t("Favorite spaces")}
      </Text>

      <SimpleGrid cols={{ base: 1, xs: 2, sm: 4 }}>
        {visibleSpaces.map((fav) => (
          <SpaceCard
            key={fav.id}
            space={fav.space!}
            topRight={
              <div data-favorited="true">
                <StarButton type="space" spaceId={fav.space!.id} size={16} />
              </div>
            }
          />
        ))}
      </SimpleGrid>

      {!expanded && allSpaces.length > INITIAL_COUNT && (
        <Group justify="center" mt="sm">
          <Button
            variant="subtle"
            size="xs"
            rightSection={<IconChevronDown size={14} />}
            onClick={() => setExpanded(true)}
          >
            {t("Show more")}
          </Button>
        </Group>
      )}
    </Box>
  );
}
