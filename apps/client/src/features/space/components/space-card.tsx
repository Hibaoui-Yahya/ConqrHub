import { ReactNode } from "react";
import { Card, Skeleton, Text } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";
import { getInitialsColor } from "@/lib/get-initials-color.ts";
import { formatMemberCount } from "@/lib";
import { getSpaceUrl } from "@/lib/config.ts";
import { prefetchSpace } from "@/features/space/queries/space-query.ts";
import classes from "./space-card.module.css";

interface SpaceCardProps {
  space: {
    id: string;
    slug: string;
    name: string;
    description?: string;
    logo?: string;
    memberCount?: number;
  };
  /* hover-revealed action in the banner corner (e.g. StarButton) */
  topRight?: ReactNode;
}

export function SpaceCardSkeleton() {
  return (
    <Card p={0} radius="md" withBorder className={classes.card}>
      <Skeleton height={76} radius={0} />
      <div className={classes.body}>
        <Skeleton height={12} width="80%" radius="xl" />
        <Skeleton height={10} mt={10} width="40%" radius="xl" />
      </div>
    </Card>
  );
}

/**
 * Plane project-card anatomy for a Hub space: gradient banner (deterministic
 * from the space name — Plane's own default-cover fallback pattern), scrim,
 * translucent logo tile, name over the banner, description + member count
 * below. No image uploads involved.
 */
export default function SpaceCard({ space, topRight }: SpaceCardProps) {
  const { t } = useTranslation();
  const color = getInitialsColor(space.name);

  return (
    <Card
      p={0}
      radius="md"
      withBorder
      component={Link}
      to={getSpaceUrl(space.slug)}
      onMouseEnter={() => prefetchSpace(space.slug, space.id)}
      className={classes.card}
    >
      <div
        className={classes.banner}
        style={{
          background: `linear-gradient(135deg, var(--mantine-color-${color}-8), var(--mantine-color-${color}-5))`,
        }}
      >
        <div className={classes.scrim} />
        {topRight && <div className={classes.topRight}>{topRight}</div>}
        <div className={classes.identity}>
          <div className={classes.logoTile}>
            <CustomAvatar
              name={space.name}
              avatarUrl={space.logo}
              type={AvatarIconType.SPACE_ICON}
              color="initials"
              variant="filled"
              size="sm"
              radius="sm"
            />
          </div>
          <Text className={classes.name} lineClamp={1}>
            {space.name}
          </Text>
        </div>
      </div>
      <div className={classes.body}>
        <Text className={classes.description} lineClamp={2}>
          {space.description || t("No description")}
        </Text>
        {typeof space.memberCount === "number" && (
          <Text className={classes.members}>
            {formatMemberCount(space.memberCount, t)}
          </Text>
        )}
      </div>
    </Card>
  );
}
