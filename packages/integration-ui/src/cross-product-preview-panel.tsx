import {
  Drawer,
  Stack,
  Group,
  Text,
  Badge,
  Anchor,
  Button,
  Divider,
} from "@mantine/core";
import { SmartObjectCard } from "./smart-object-card";
import type { PresentationModel } from "./types";

/**
 * Cross-product preview panel primitive (blueprint §5.2C, §7.1, §8.7).
 *
 * An API-fed side panel (never a broad iframe) for previewing a resolved object
 * without leaving the current context. Presentational only — the host supplies
 * the resolved model and action handlers; only one should be open at a time.
 */
export function CrossProductPreviewPanel({
  model,
  opened,
  onClose,
  onAction,
}: {
  model?: PresentationModel;
  opened: boolean;
  onClose: () => void;
  onAction?: (actionId: string) => void;
}) {
  const fields = model?.fields ?? {};
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      keepMounted={false}
      title={
        <Text fw={600} c="var(--txt-primary)">
          {model?.title ?? "Preview"}
        </Text>
      }
      styles={{ content: { background: "var(--bg-surface-1)" } }}
    >
      {!model ? (
        <Text size="sm" c="var(--txt-tertiary)">
          Nothing selected.
        </Text>
      ) : (
        <Stack gap="md">
          <SmartObjectCard model={model} />

          {Object.keys(fields).length > 0 && (
            <Stack gap={6}>
              {Object.entries(fields).map(([k, v]) => (
                <Group key={k} justify="space-between" gap="sm" wrap="nowrap">
                  <Text size="xs" c="var(--txt-tertiary)" tt="capitalize">
                    {k}
                  </Text>
                  <Text size="xs" c="var(--txt-secondary)" ta="right">
                    {formatValue(v)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}

          {model.lastRefreshedAt && (
            <Text size="xs" c="var(--txt-tertiary)">
              Last refreshed{" "}
              {new Date(model.lastRefreshedAt).toLocaleString()}
            </Text>
          )}

          {(model.actions?.length || model.deepLink) && (
            <>
              <Divider color="var(--border-subtle)" />
              <Group gap="xs">
                {model.actions
                  ?.filter((a) => a.allowed)
                  .map((a) => (
                    <Button
                      key={a.id}
                      size="xs"
                      variant="light"
                      onClick={() => onAction?.(a.id)}
                    >
                      {a.label}
                    </Button>
                  ))}
                {model.deepLink && (
                  <Anchor
                    href={model.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="sm"
                  >
                    Open in source ↗
                  </Anchor>
                )}
              </Group>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}
