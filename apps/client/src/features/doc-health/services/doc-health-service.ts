import api from "@/lib/api-client";
import {
  IHealthIssuesPage,
  IHealthIssuesQuery,
  IHealthScore,
  IWorkspaceHealth,
} from "@/features/doc-health/types/doc-health.types";

export async function getWorkspaceHealth(): Promise<IWorkspaceHealth> {
  const req = await api.post<IWorkspaceHealth>("/workspace-health");
  return req.data;
}

export async function getSpaceHealth(
  spaceId: string,
): Promise<IHealthScore> {
  const req = await api.post<IHealthScore>("/workspace-health/space", {
    spaceId,
  });
  return req.data;
}

export async function getHealthIssues(
  params: IHealthIssuesQuery,
): Promise<IHealthIssuesPage> {
  const req = await api.post<IHealthIssuesPage>(
    "/workspace-health/issues",
    params,
  );
  return req.data;
}
