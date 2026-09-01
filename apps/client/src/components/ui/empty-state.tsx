import { Stack, Text, Loader, Center } from "@mantine/core";
import { type TablerIcon, IconAlertTriangle } from "@tabler/icons-react";
import { ReactNode } from "react";
import clsx from "clsx";
import classes from "./empty-state.module.css";

type EmptyStateVariant = "default" | "loading" | "error";

type EmptyStateProps = {
  icon?: TablerIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: EmptyStateVariant;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "default",
}: EmptyStateProps) {
  if (variant === "loading") {
    return (
      <Center className={classes.root}>
        <Stack align="center" gap="md">
          <Loader size="md" />
          <Text className={classes.description}>{title}</Text>
        </Stack>
      </Center>
    );
  }

  const isError = variant === "error";
  const TileIcon = isError ? (Icon ?? IconAlertTriangle) : Icon;

  return (
    <div className={classes.root}>
      <Stack align="center" gap="xs">
        {TileIcon && (
          <div className={clsx(classes.tile, isError && classes.tileDanger)}>
            <TileIcon size={24} stroke={1.5} />
          </div>
        )}
        <Text className={classes.title}>{title}</Text>
        {description && (
          <Text className={classes.description} maw={350}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </div>
  );
}
