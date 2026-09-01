import { Text, Group, Button } from "@mantine/core";
import { useGetSpacesQuery } from "@/features/space/queries/space-query.ts";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconArrowRight } from "@tabler/icons-react";
import CardCarousel from "@/components/ui/card-carousel";
import SpaceCard, {
  SpaceCardSkeleton,
} from "@/features/space/components/space-card.tsx";

export default function SpaceCarousel() {
  const { t } = useTranslation();
  const { data, isPending } = useGetSpacesQuery({ limit: 20 });

  if (isPending) {
    return (
      <>
        <Group justify="space-between" align="center" mb="md">
          <Text fz="sm" fw={500}>
            {t("Spaces you belong to")}
          </Text>
        </Group>
        <CardCarousel ariaLabel={t("Spaces you belong to")}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ width: 220 }}>
              <SpaceCardSkeleton />
            </div>
          ))}
        </CardCarousel>
      </>
    );
  }

  const cards = data?.items.map((space) => (
    <div key={space.id} style={{ width: 220 }}>
      <SpaceCard space={space} />
    </div>
  ));

  return (
    <>
      <Group justify="space-between" align="center" mb="md">
        <Text fz="sm" fw={500}>
          {t("Spaces you belong to")}
        </Text>
      </Group>

      <CardCarousel ariaLabel={t("Spaces you belong to")}>{cards}</CardCarousel>

      {data?.items && data.items.length > 1 && (
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
