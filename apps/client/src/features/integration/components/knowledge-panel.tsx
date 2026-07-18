import { useMemo, useState } from "react";
import {
  Stack,
  Text,
  Group,
  Divider,
  Loader,
  Alert,
  Button,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import {
  useRelationships,
  useResolveSmartObjects,
} from "@/features/integration/queries/integration-query";
import { useIntegrationEvents } from "@/features/integration/queries/use-integration-events";
import { SmartObjectCard } from "./smart-object-card";
import { LinkOrCreateWorkItem } from "./link-or-create-work-item";
import { relationLabel } from "@/features/integration/utils/relation-labels";
import { IntegrationRelationship } from "@/features/integration/types/integration.types";
import { EmptyState } from "@conqr/ui";
import { AccessibleIcon } from "@conqr/icons";

/**
 * Backlink / knowledge panel (blueprint §5.2D). Given the URN of the current
 * object, shows all related cross-product objects grouped by relationship
 * meaning (Implements, Documented by, …) rather than a flat list of links.
 */
export function KnowledgePanel({
  urn,
  planeProjectId,
}: {
  urn: string;
  planeProjectId?: string;
}) {
  const { data: relationships, isLoading, isError } = useRelationships(urn);
  const [linkOpen, setLinkOpen] = useState(false);
  // Live-refresh smart cards when Plane changes (SSE, §8.4).
  useIntegrationEvents();

  // From THIS object's perspective, the counterpart is the other endpoint and
  // the relation is stated in the current object's direction.
  const perspective = useMemo(() => {
    return (relationships ?? []).map((rel) => fromPerspective(rel, urn));
  }, [relationships, urn]);

  const counterpartUrns = useMemo(
    () => Array.from(new Set(perspective.map((p) => p.counterpartUrn))),
    [perspective],
  );

  const { data: models } = useResolveSmartObjects(
    counterpartUrns,
    planeProjectId,
  );

  const modelByUrn = useMemo(() => {
    const map = new Map<string, (typeof models)[number]>();
    (models ?? []).forEach((m) => map.set(m.urn, m));
    return map;
  }, [models]);

  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const p of perspective) {
      const label = relationLabel(p.relation);
      if (!g.has(label)) g.set(label, []);
      g.get(label)!.push(p.counterpartUrn);
    }
    return Array.from(g.entries());
  }, [perspective]);

  if (isLoading) {
    return (
      <Group gap="xs" p="sm">
        <Loader size="xs" />
        <Text size="sm" c="var(--txt-tertiary)">
          Loading related work &amp; knowledge…
        </Text>
      </Group>
    );
  }

  if (isError) {
    return (
      <Alert color="red" variant="light" radius="sm">
        Couldn't load related items.
      </Alert>
    );
  }

  const addButton = (
    <Button
      size="xs"
      variant="light"
      leftSection={<IconPlus size={14} />}
      onClick={() => setLinkOpen(true)}
    >
      Link work item
    </Button>
  );

  const linkModal = (
    <LinkOrCreateWorkItem
      sourceUrn={urn}
      planeProjectId={planeProjectId}
      opened={linkOpen}
      onClose={() => setLinkOpen(false)}
    />
  );

  if (groups.length === 0) {
    return (
      <Stack gap="sm" p="sm">
        <EmptyState
          icon={<AccessibleIcon name="relation" label="Links" size={20} />}
          title="No linked work or knowledge yet"
          description="Link a Plane work item to trace delivery against this page."
        />
        {addButton}
        {linkModal}
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="xs">
      <Group justify="flex-end">{addButton}</Group>
      {linkModal}
      {groups.map(([label, urns]) => (
        <div key={label}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            c="var(--txt-tertiary)"
            mb={6}
          >
            {label}
          </Text>
          <Stack gap="xs">
            {urns.map((u) => (
              <SmartObjectCard key={u} model={modelByUrn.get(u)} loading={!models} />
            ))}
          </Stack>
          <Divider mt="md" color="var(--border-subtle)" />
        </div>
      ))}
    </Stack>
  );
}

function fromPerspective(rel: IntegrationRelationship, urn: string) {
  if (rel.sourceUrn === urn) {
    return { counterpartUrn: rel.targetUrn, relation: rel.relationType };
  }
  return { counterpartUrn: rel.sourceUrn, relation: rel.inverseRelationType };
}
