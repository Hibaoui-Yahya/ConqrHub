import { useState } from "react";
import { Button, Center, Loader, Stack, Text } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";
import {
  useMyInsightVotesQuery,
  usePageInsightsQuery,
} from "../queries/expertise-query";
import { IInsight } from "../types/expertise.types";
import { InsightCard } from "./insight-card";
import { InsightFormModal } from "./insight-form-modal";

/**
 * Side panel of a page: what experts want readers of this page to know.
 * Space experts and admins write drafts, publish and retire them; every
 * reader sees the published ones and can say whether they helped.
 */
export function PageExpertisePanel({
  pageId,
  spaceId,
}: {
  pageId?: string;
  spaceId?: string;
}) {
  const { t } = useTranslation();
  const { data: space } = useSpaceQuery(spaceId ?? "");
  const ability = useSpaceAbility(space?.membership?.permissions);
  const canManage = ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Insight);

  const { data: insights, isLoading } = usePageInsightsQuery(pageId);
  const ids = (insights ?? []).map((i) => i.id);
  const { data: votes } = useMyInsightVotesQuery(ids);

  const [editing, setEditing] = useState<IInsight | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  if (!pageId) return null;

  const open = (insight: IInsight | null) => {
    setEditing(insight);
    setFormOpen(true);
  };

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t("Advice from the experts of this space about this page.")}
      </Text>

      {canManage && (
        <Button
          size="xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => open(null)}
        >
          {t("Add an insight")}
        </Button>
      )}

      {isLoading ? (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      ) : (insights ?? []).length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {t("No expert insight on this page yet.")}
        </Text>
      ) : (
        (insights ?? []).map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            myVote={votes?.[insight.id] ?? null}
            canManage={canManage}
            onEdit={open}
            compact
          />
        ))
      )}

      <InsightFormModal
        opened={formOpen}
        onClose={() => setFormOpen(false)}
        insight={editing}
        pageId={pageId}
        spaceId={spaceId}
      />
    </Stack>
  );
}
