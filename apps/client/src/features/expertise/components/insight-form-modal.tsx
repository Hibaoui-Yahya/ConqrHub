import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  IInsight,
  InsightConfidence,
  InsightType,
} from "../types/expertise.types";
import {
  useCreateInsightMutation,
  useUpdateInsightMutation,
} from "../queries/expertise-query";
import { CONFIDENCE_LABELS, INSIGHT_TYPE_LABELS } from "./insight-labels";

type Props = {
  opened: boolean;
  onClose: () => void;
  /** Editing an existing draft; otherwise a new insight on this page. */
  insight?: IInsight | null;
  pageId?: string;
  spaceId?: string;
};

export function InsightFormModal({
  opened,
  onClose,
  insight,
  pageId,
  spaceId,
}: Props) {
  const { t } = useTranslation();
  const create = useCreateInsightMutation();
  const update = useUpdateInsightMutation();
  const [insightType, setInsightType] = useState<InsightType>("notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confidence, setConfidence] = useState<InsightConfidence>("medium");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    if (!opened) return;
    setInsightType(insight?.insightType ?? "notice");
    setTitle(insight?.title ?? "");
    setBody(insight?.body ?? "");
    setConfidence(insight?.confidence ?? "medium");
    setExpiresAt(insight?.expiresAt ? insight.expiresAt.slice(0, 10) : "");
  }, [opened, insight]);

  const busy = create.isPending || update.isPending;
  const valid = title.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    const values = {
      insightType,
      title: title.trim(),
      body: body.trim(),
      confidence,
      // End of the chosen day, so the insight lasts through it.
      expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
    };
    try {
      if (insight) {
        await update.mutateAsync({ insightId: insight.id, ...values });
      } else if (pageId && spaceId) {
        const { expiresAt: exp, ...rest } = values;
        await create.mutateAsync({
          pageId,
          spaceId,
          ...rest,
          ...(exp ? { expiresAt: exp } : {}),
        });
      }
      onClose();
    } catch {
      // the mutation shows the error
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={insight ? t("Edit the insight") : t("New expert insight")}
      centered
      size="lg"
    >
      <Stack gap="sm">
        <Group grow>
          <Select
            label={t("Kind")}
            data={(Object.keys(INSIGHT_TYPE_LABELS) as InsightType[]).map((k) => ({
              value: k,
              label: t(INSIGHT_TYPE_LABELS[k]),
            }))}
            value={insightType}
            onChange={(v) => v && setInsightType(v as InsightType)}
            allowDeselect={false}
          />
          <Select
            label={t("Confidence")}
            data={(Object.keys(CONFIDENCE_LABELS) as InsightConfidence[]).map(
              (k) => ({ value: k, label: t(CONFIDENCE_LABELS[k]) }),
            )}
            value={confidence}
            onChange={(v) => v && setConfidence(v as InsightConfidence)}
            allowDeselect={false}
          />
        </Group>
        <TextInput
          label={t("Title")}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          maxLength={200}
          required
          data-autofocus
        />
        <Textarea
          label={t("What readers should know")}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          autosize
          minRows={4}
          maxRows={12}
          required
        />
        <TextInput
          type="date"
          label={t("Valid until")}
          description={t("Optional. The insight is retired automatically after this date.")}
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.currentTarget.value)}
          w={220}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!valid}>
            {insight ? t("Save") : t("Save as draft")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
