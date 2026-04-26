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
  snapshotHealthNow,
} from "@/features/doc-health/services/doc-health-service";
import {
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
    onSuccess: () => {
      notifications.show({ message: t("Snapshot captured") });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "trend"] });
      queryClient.invalidateQueries({ queryKey: ["doc-health", "workspace"] });
    },
    onError: (error) => {
      const message = (error as any)?.response?.data?.message ?? t("Snapshot failed");
      notifications.show({ message, color: "red" });
    },
  });
}
