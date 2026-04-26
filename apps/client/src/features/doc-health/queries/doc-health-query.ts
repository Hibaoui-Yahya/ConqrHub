import {
  keepPreviousData,
  useQuery,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  getHealthIssues,
  getSpaceHealth,
  getWorkspaceHealth,
} from "@/features/doc-health/services/doc-health-service";
import {
  IHealthIssuesPage,
  IHealthIssuesQuery,
  IHealthScore,
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
