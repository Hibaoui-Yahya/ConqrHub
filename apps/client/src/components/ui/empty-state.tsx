import { Stack, Text, Loader, Center } from "@mantine/core";
import { type TablerIcon } from "@tabler/icons-react";
import { ReactNode } from "react";
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
          <Text size="sm" c="dimmed">
            {title}
          </Text>
        </Stack>
      </Center>
    );
  }

  if (variant === "error") {
    return (
      <Center className={classes.root}>
        <Stack align="center" gap="md">
          <Text size="lg" fw={500} c="red">
            {title}
          </Text>
          {description && (
            <Text size="sm" c="dimmed" maw={400}>
              {description}
            </Text>
          )}
          {action}
        </Stack>
      </Center>
    );
  }

  return (
    <div className={classes.root}>
      <Stack align="center" gap="xs">
        {Icon && <Icon size={40} stroke={1.5} color="var(--mantine-color-dimmed)" />}
        <Text size="lg" fw={500}>
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" maw={350}>
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </div>
  );
}
