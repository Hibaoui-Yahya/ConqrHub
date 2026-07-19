import type { ReactNode } from "react";
import {
  Anchor,
  Badge,
  Card,
  Group,
  Skeleton,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconLock,
  IconTrash,
  IconPlugConnectedX,
} from "@tabler/icons-react";
import type { PresentationModel } from "./types";

/**
 * Renders a resolved cross-product object (blueprint §5, §8.6). Every
 * resolution state has an explicit, designed presentation — a stale/restricted/
 * deleted object is never silently shown as live. Styled entirely with
 * @conqr/tokens variables so it looks identical in ConqrHub and the Plane fork.
 */
export function SmartObjectCard({
  model,
  loading,
}: {
  model?: PresentationModel;
  loading?: boolean;
}) {
  if (loading || !model) {
    return <Skeleton height={64} radius="sm" />;
  }

  switch (model.state) {
    case "restricted":
      return (
        <NonLiveCard
          icon={<IconLock size={16} />}
          label="Restricted"
          message="You don't have access to this item."
        />
      );
    case "not_found":
      return (
        <NonLiveCard
          icon={<IconAlertTriangle size={16} />}
          label="Not found"
          message="This item no longer exists."
        />
      );
    case "deleted":
      return (
        <NonLiveCard
          icon={<IconTrash size={16} />}
          label="Deleted"
          message={model.title ?? "This item was deleted."}
        />
      );
    case "integration_disabled":
      return (
        <NonLiveCard
          icon={<IconPlugConnectedX size={16} />}
          label="Integration off"
          message="Plane integration is not configured."
        />
      );
    case "source_unavailable":
      return (
        <NonLiveCard
          icon={<IconAlertTriangle size={16} />}
          label="Unavailable"
          message="Couldn't reach the source. Try again shortly."
        />
      );
    default:
      return <LiveCard model={model} />;
  }
}

function LiveCard({ model }: { model: PresentationModel }) {
  const fields = model.fields ?? {};
  const stateName = fields["state"] as string | undefined;
  const key = fields["key"] as number | string | undefined;
  const priority = fields["priority"] as string | undefined;
  const isStale = model.state === "stale";

  const titleNode = (
    <Text fw={600} size="sm" c="var(--txt-primary)" lineClamp={1}>
      {model.title ?? model.urn}
    </Text>
  );

  return (
    <Card
      withBorder
      radius="sm"
      padding="sm"
      style={{
        borderColor: "var(--border-subtle)",
        background: "var(--bg-surface-1)",
      }}
    >
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {key != null && (
            <Badge
              variant="light"
              radius="sm"
              size="sm"
              color="gray"
              style={{ flexShrink: 0 }}
            >
              #{key}
            </Badge>
          )}
          {model.deepLink ? (
            <Anchor
              href={model.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              underline="never"
              style={{ minWidth: 0 }}
            >
              {titleNode}
            </Anchor>
          ) : (
            titleNode
          )}
        </Group>
        <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
          {priority && priority !== "none" && (
            <Badge size="sm" radius="sm" variant="light" color="orange">
              {priority}
            </Badge>
          )}
          {stateName && (
            <Badge
              size="sm"
              radius="sm"
              variant="light"
              // Explicit Plane tokens — guarantees contrast in light & dark,
              // where Mantine's computed light-variant color falls short.
              styles={{
                root: {
                  backgroundColor: "var(--bg-accent-subtle)",
                  color: "var(--txt-accent-primary)",
                },
              }}
            >
              {stateName}
            </Badge>
          )}
          {isStale && (
            <Tooltip
              label={
                model.lastRefreshedAt
                  ? `Last updated ${new Date(model.lastRefreshedAt).toLocaleString()}`
                  : "Showing a cached copy"
              }
            >
              <Badge size="sm" radius="sm" variant="outline" color="yellow">
                Stale
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Card>
  );
}

function NonLiveCard({
  icon,
  label,
  message,
}: {
  icon: ReactNode;
  label: string;
  message: string;
}) {
  return (
    <Card
      withBorder
      radius="sm"
      padding="sm"
      style={{
        borderColor: "var(--border-subtle)",
        background: "var(--bg-surface-2)",
      }}
    >
      <Group gap={8} wrap="nowrap">
        <Text c="var(--txt-tertiary)" style={{ display: "flex" }}>
          {icon}
        </Text>
        <div style={{ minWidth: 0 }}>
          <Text size="xs" fw={600} c="var(--txt-secondary)">
            {label}
          </Text>
          <Text size="xs" c="var(--txt-tertiary)" lineClamp={1}>
            {message}
          </Text>
        </div>
      </Group>
    </Card>
  );
}
