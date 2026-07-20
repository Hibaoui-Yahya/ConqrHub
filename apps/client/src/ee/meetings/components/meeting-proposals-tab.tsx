import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Anchor,
  Autocomplete,
  Badge,
  Blockquote,
  Button,
  Card,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconChecks,
  IconExternalLink,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { getAllMappings } from "@/features/integration/services/integration-service";
import {
  approveProposal,
  approveSafeProposals,
  listMeetingProposals,
  rejectProposal,
} from "../services/meeting-service";
import type { ActionProposal, MeetingStatusEx } from "../types/meeting.types";

/** Suite apps the integration layer cannot execute against yet. */
const UNCONNECTED_TARGET_APPS = new Set(["conqrcrm", "conqrtoptalent"]);

function riskColor(riskLevel: string): string {
  return riskLevel === "risky" ? "red" : "teal";
}

interface ProposalCardProps {
  meetingId: string;
  proposal: ActionProposal;
  projectOptions: string[];
  onChanged: () => void;
}

function ProposalCard({
  meetingId,
  proposal,
  projectOptions,
  onChanged,
}: ProposalCardProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [projectId, setProjectId] = useState("");

  const missingFields = proposal.validation?.missingFields ?? [];
  const warnings = proposal.validation?.warnings ?? [];
  const needsProjectId = missingFields.includes("projectId");
  const targetNotConnected = UNCONNECTED_TARGET_APPS.has(proposal.targetApp);
  const isRisky = proposal.riskLevel === "risky";
  const isPending =
    proposal.status === "proposed" ||
    proposal.status === "draft" ||
    proposal.status === "failed";
  const isRunning =
    proposal.status === "approved" || proposal.status === "executing";
  const duplicates = proposal.duplicateCheck?.candidates ?? [];

  const doApprove = async (confirmRisk: boolean) => {
    setBusy("approve");
    try {
      const payload =
        needsProjectId && projectId.trim()
          ? { ...proposal.payload, projectId: projectId.trim() }
          : undefined;
      await approveProposal(meetingId, proposal.id, {
        payload,
        confirmRisk: confirmRisk || undefined,
      });
      notifications.show({
        color: "teal",
        message: t("Proposal approved. Executing…"),
      });
      onChanged();
    } catch (err: any) {
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to approve"),
      });
    } finally {
      setBusy(null);
    }
  };

  const onApprove = () => {
    if (isRisky) {
      modals.openConfirmModal({
        title: t("Approve risky action?"),
        centered: true,
        children: (
          <Text size="sm">
            {t(
              "This action is flagged as risky ('{{title}}'). It may have side effects that are hard to undo. Approve anyway?",
              { title: proposal.title },
            )}
          </Text>
        ),
        labels: { confirm: t("Approve"), cancel: t("Cancel") },
        confirmProps: { color: "red" },
        onConfirm: () => void doApprove(true),
      });
    } else {
      void doApprove(false);
    }
  };

  const onReject = async () => {
    setBusy("reject");
    try {
      await rejectProposal(meetingId, proposal.id);
      notifications.show({ color: "gray", message: t("Proposal rejected") });
      onChanged();
    } catch (err: any) {
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to reject"),
      });
    } finally {
      setBusy(null);
    }
  };

  const approveBlocked =
    targetNotConnected || (needsProjectId && !projectId.trim());

  const approveButton = (
    <Button
      size="xs"
      color={isRisky ? "red" : undefined}
      leftSection={<IconCheck size={14} />}
      loading={busy === "approve"}
      disabled={approveBlocked || busy !== null}
      onClick={onApprove}
    >
      {proposal.status === "failed" ? t("Retry") : t("Approve")}
    </Button>
  );

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={600}>{proposal.title}</Text>
            <Group gap="xs" mt={4}>
              <Badge size="sm" variant="light">
                {proposal.kind}
              </Badge>
              <Badge size="sm" variant="light" color="gray">
                {proposal.targetApp}
              </Badge>
              {proposal.commitment && (
                <Badge size="sm" variant="light" color="grape">
                  {t(proposal.commitment)}
                </Badge>
              )}
              <Badge size="sm" color={riskColor(proposal.riskLevel)}>
                {t(proposal.riskLevel)}
              </Badge>
              <Badge
                size="sm"
                variant="outline"
                color={
                  proposal.status === "executed"
                    ? "teal"
                    : proposal.status === "failed"
                      ? "red"
                      : proposal.status === "rejected"
                        ? "gray"
                        : "blue"
                }
              >
                {t(proposal.status)}
              </Badge>
            </Group>
          </div>
          {proposal.confidence != null && (
            <Stack gap={2} align="flex-end" w={120}>
              <Text size="xs" c="dimmed">
                {t("Confidence")} {Math.round(proposal.confidence * 100)}%
              </Text>
              <Progress
                value={proposal.confidence * 100}
                size="sm"
                w="100%"
                color={proposal.confidence >= 0.7 ? "teal" : "yellow"}
              />
            </Stack>
          )}
        </Group>

        {proposal.reason && (
          <Text size="sm" c="dimmed">
            {proposal.reason}
          </Text>
        )}

        {(proposal.evidence ?? []).map((ev, i) => (
          <Blockquote key={i} p="xs" color="gray" fz="sm">
            {ev.quote}
          </Blockquote>
        ))}

        {duplicates.length > 0 && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            color="yellow"
            variant="light"
          >
            {duplicates.map((c, i) => (
              <Text size="sm" key={i}>
                {t("Possible duplicate: {{title}}", { title: c.title })}
                {c.url && (
                  <>
                    {" "}
                    <Anchor href={c.url} target="_blank" size="sm">
                      {t("Open")}
                    </Anchor>
                  </>
                )}
              </Text>
            ))}
          </Alert>
        )}

        {warnings.length > 0 && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="yellow"
            variant="light"
          >
            {warnings.map((w, i) => (
              <Text size="sm" key={i}>
                {w}
              </Text>
            ))}
          </Alert>
        )}

        {missingFields.length > 0 && isPending && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="orange"
            variant="light"
          >
            <Text size="sm">
              {t("Missing required fields: {{fields}}", {
                fields: missingFields.join(", "),
              })}
            </Text>
            {needsProjectId && (
              <Autocomplete
                mt="xs"
                size="xs"
                w={280}
                label={t("ConqrPlane project ID")}
                placeholder={t("Select or paste a project ID")}
                data={projectOptions}
                value={projectId}
                onChange={setProjectId}
              />
            )}
          </Alert>
        )}

        {proposal.status === "executed" && proposal.executionResult && (
          <Alert icon={<IconCheck size={16} />} color="teal" variant="light">
            <Group gap="xs">
              <Text size="sm">{t("Executed successfully.")}</Text>
              {proposal.executionResult.url ? (
                <Anchor
                  href={proposal.executionResult.url}
                  target="_blank"
                  size="sm"
                >
                  <Group gap={4} display="inline-flex">
                    {t("Open result")} <IconExternalLink size={12} />
                  </Group>
                </Anchor>
              ) : proposal.executionResult.entityId ? (
                <Text size="sm" c="dimmed">
                  {proposal.executionResult.entityId}
                </Text>
              ) : null}
            </Group>
          </Alert>
        )}

        {proposal.status === "failed" && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="red"
            variant="light"
          >
            <Text size="sm">
              {proposal.executionResult?.error ?? t("Execution failed.")}
            </Text>
          </Alert>
        )}

        {isRunning && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="sm" c="dimmed">
              {t("Executing…")}
            </Text>
          </Group>
        )}

        {isPending && (
          <Group justify="flex-end" gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconX size={14} />}
              loading={busy === "reject"}
              disabled={busy !== null}
              onClick={() => void onReject()}
            >
              {t("Reject")}
            </Button>
            {targetNotConnected ? (
              <Tooltip
                label={t("{{app}} is not connected yet", {
                  app: proposal.targetApp,
                })}
              >
                <span>{approveButton}</span>
              </Tooltip>
            ) : (
              approveButton
            )}
          </Group>
        )}
      </Stack>
    </Card>
  );
}

interface MeetingProposalsTabProps {
  meetingId: string;
  status: MeetingStatusEx;
}

export function MeetingProposalsTab({
  meetingId,
  status,
}: MeetingProposalsTabProps) {
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const pollRef = useRef<number | null>(null);

  const refresh = () => {
    listMeetingProposals(meetingId)
      .then(setProposals)
      .catch((err: any) => {
        notifications.show({
          color: "red",
          message:
            err?.response?.data?.message ?? t("Failed to load proposals"),
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    refresh();
    // Refetch when the pipeline status changes — proposals appear once
    // the proposals_generating step completes.
  }, [meetingId, status]);

  // Known ConqrPlane project ids (from project↔space mappings) offered
  // in the inline project picker for create_work_item proposals.
  useEffect(() => {
    getAllMappings()
      .then((mappings) => {
        const ids = Array.from(
          new Set(mappings.map((m) => m.planeProjectId).filter(Boolean)),
        );
        setProjectOptions(ids);
      })
      .catch(() => {
        // Integration may be disabled — the picker degrades to a free
        // text input.
      });
  }, []);

  const hasRunning = useMemo(
    () =>
      proposals.some(
        (p) => p.status === "approved" || p.status === "executing",
      ),
    [proposals],
  );

  // Poll every 3s while any proposal is still executing.
  useEffect(() => {
    if (!hasRunning) {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(refresh, 3000);
    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasRunning, meetingId]);

  const approveAllSafe = async () => {
    setBulkApproving(true);
    try {
      const res = await approveSafeProposals(meetingId);
      const approvedCount = res.approved?.length ?? 0;
      notifications.show({
        color: approvedCount > 0 ? "teal" : "gray",
        message: t("{{count}} proposal(s) approved", {
          count: approvedCount,
        }),
      });
      for (const skipped of res.skipped ?? []) {
        const proposal = proposals.find((p) => p.id === skipped.id);
        notifications.show({
          color: "yellow",
          title: t("Skipped: {{title}}", {
            title: proposal?.title ?? skipped.id,
          }),
          message: skipped.reason,
        });
      }
      refresh();
    } catch (err: any) {
      notifications.show({
        color: "red",
        message:
          err?.response?.data?.message ?? t("Failed to approve proposals"),
      });
    } finally {
      setBulkApproving(false);
    }
  };

  if (loading) {
    return (
      <Paper p="md" withBorder>
        <Group justify="center" py="md">
          <Loader size="sm" />
        </Group>
      </Paper>
    );
  }

  if (proposals.length === 0) {
    return (
      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed">
          {t("No action proposals yet.")}
        </Text>
      </Paper>
    );
  }

  const hasSafePending = proposals.some(
    (p) =>
      p.status === "proposed" &&
      p.riskLevel === "safe" &&
      (p.validation?.missingFields ?? []).length === 0 &&
      !UNCONNECTED_TARGET_APPS.has(p.targetApp),
  );

  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <Button
          size="xs"
          variant="light"
          leftSection={<IconChecks size={14} />}
          loading={bulkApproving}
          disabled={!hasSafePending}
          onClick={() => void approveAllSafe()}
        >
          {t("Approve all safe")}
        </Button>
      </Group>

      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          meetingId={meetingId}
          proposal={p}
          projectOptions={projectOptions}
          onChanged={refresh}
        />
      ))}

      {hasRunning && (
        <Group gap="xs" justify="center">
          <IconRefresh size={14} />
          <Text size="xs" c="dimmed">
            {t("Refreshing while actions execute…")}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
