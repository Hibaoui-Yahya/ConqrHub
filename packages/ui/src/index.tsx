import type { ReactNode, CSSProperties } from "react";
import { Card, Group, Stack, Text } from "@mantine/core";

/**
 * @conqr/ui — shared UI primitives (blueprint §7.1) styled entirely with
 * @conqr/tokens variables so a surface/state/empty pattern looks and behaves
 * identically in ConqrHub and the Plane fork.
 */

export type SurfaceLevel = 1 | 2;

export function Surface({
  level = 1,
  children,
  style,
}: {
  level?: SurfaceLevel;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Card
      withBorder
      radius="lg"
      padding="sm"
      style={{
        background: level === 2 ? "var(--bg-surface-2)" : "var(--bg-surface-1)",
        borderColor: "var(--border-subtle)",
        borderWidth: "0.5px",
        ...style,
      }}
    >
      {children}
    </Card>
  );
}

export type SemanticStatus =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const STATUS_TOKEN: Record<SemanticStatus, string> = {
  success: "var(--bg-success-primary)",
  warning: "var(--bg-warning-primary)",
  danger: "var(--bg-danger-primary)",
  info: "var(--bg-accent-primary)",
  neutral: "var(--txt-tertiary)",
};

/** A status dot — the one semantic-state signal (never color-only: pair a label). */
export function StatusDot({
  status,
  label,
}: {
  status: SemanticStatus;
  label: string;
}) {
  return (
    <Group gap={6} wrap="nowrap">
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: STATUS_TOKEN[status],
          flexShrink: 0,
        }}
      />
      <Text size="xs" c="var(--txt-secondary)">
        {label}
      </Text>
    </Group>
  );
}

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <Stack align="center" gap={6} py="lg">
      {icon && <div style={{ color: "var(--txt-tertiary)" }}>{icon}</div>}
      <Text fw={600} size="sm" c="var(--txt-secondary)">
        {title}
      </Text>
      {description && (
        <Text size="xs" c="var(--txt-tertiary)" ta="center">
          {description}
        </Text>
      )}
    </Stack>
  );
}
