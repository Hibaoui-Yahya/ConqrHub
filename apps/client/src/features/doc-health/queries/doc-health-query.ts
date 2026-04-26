import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getHealthIssues,
  getHealthTrend,
  getSpaceHealth,
  getWorkspaceHealth,
  listHealthAlerts,
  snapshotHealthNow,
  subscribeHealthAlert,
  unsubscribeHealthAlert,
} from "@/features/doc-health/services/doc-health-service";
import {
  IHealthAlertsResponse,
  IHealthIssuesPage,
  IHealthIssuesQuery,
  IHealthScore,
  IHealthTrendQuery,
  IHealthTrendResponse,
  IWorkspaceHealth,
} from "@/features/doc-health/types/doc-health.types";

export function useWorkspaceHealthQuery(): UseQueryResult<
  IWorkspaceHealth,
  Error
> {
  return useQuery({
    queryKey: ["doc-health", "workspace"],
    queryFn: getWorkspaceHealth,
  });
}

export function useSpaceHealthQuery(
  spaceId: string | null,
): UseQueryResult<IHealthScore, Error> {
  return useQuery({
    queryKey: ["doc-health", "space", spaceId],
    queryFn: () => getSpaceHealth(spaceId!),
    enabled: Boolean(spaceId),
  });
}

export function useHealthIssuesQuery(
  params: IHealthIssuesQuery,
): UseQueryResult<IHealthIssuesPage, Error> {
  return useQuery({
    queryKey: ["doc-health", "issues", params],
    queryFn: () => getHealthIssues(params),
    placeholderData: keepPreviousData,
  });
}

export function useHealthTrendQuery(
  params: IHealthTrendQuery,
): UseQueryResult<IHealthTrendResponse, Error> {
  return useQuery({
    queryKey: ["doc-health", "trend", params],
    queryFn: () => getHealthTrend(params),
    placeholderData: keepPreviousData,
  });
}

export function useSnapshotHealthNowMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: snapshotHealthNow,
    onSuccess: (data) => {
      const fired = (data as { alertsFired?: number })?.alertsFired ?? 0;
      notifications.show({
        message:
          fired > 0
            ? t("Snapshot captured — {{count}} alert(s) fired", { count: fired })
            : t("Snapshot captured"),
      });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "trend"] });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "workspace"] });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "alerts"] });
    },
    onError: (error) => {
      const message = (error as any)?.response?.data?.message ?? t("Snapshot failed");
      notifications.show({ message, color: "red" });
    },
  });
}

export function useHealthAlertsQuery(): UseQueryResult<
  IHealthAlertsResponse,
  Error
> {
  return useQuery({
    queryKey: ["doc-health", "alerts"],
    queryFn: listHealthAlerts,
  });
}

export function useSubscribeHealthAlertMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: subscribeHealthAlert,
    onSuccess: () => {
      notifications.show({ message: t("Alert saved") });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "alerts"] });
    },
    onError: (error) => {
      const message =
        (error as any)?.response?.data?.message ?? t("Could not save alert");
      notifications.show({ message, color: "red" });
    },
  });
}

export function useUnsubscribeHealthAlertMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: unsubscribeHealthAlert,
    onSuccess: () => {
      notifications.show({ message: t("Alert removed") });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "alerts"] });
    },
    onError: (error) => {
      const message =
        (error as any)?.response?.data?.message ?? t("Could not remove alert");
      notifications.show({ message, color: "red" });
    },
  });
}
