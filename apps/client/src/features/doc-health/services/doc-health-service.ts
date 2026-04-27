import api from "@/lib/api-client";
import {
  IHealthAlert,
  IHealthAlertsResponse,
  IHealthAlertSubscribeInput,
  IHealthIssuesPage,
  IHealthIssuesQuery,
  IHealthScore,
  IHealthTrendQuery,
  IHealthTrendResponse,
  IKnowledgeGapsQuery,
  IKnowledgeGapsResponse,
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

export async function getHealthTrend(
  params: IHealthTrendQuery,
): Promise<IHealthTrendResponse> {
  const req = await api.post<IHealthTrendResponse>(
    "/workspace-health/trend",
    params,
  );
  return req.data;
}

export async function snapshotHealthNow(): Promise<{
  capturedAt: string;
  alertsFired: number;
}> {
  const req = await api.post<{ capturedAt: string; alertsFired: number }>(
    "/workspace-health/snapshot",
  );
  return req.data;
}

export async function listHealthAlerts(): Promise<IHealthAlertsResponse> {
  const req = await api.post<IHealthAlertsResponse>(
    "/workspace-health/alerts",
  );
  return req.data;
}

export async function subscribeHealthAlert(
  input: IHealthAlertSubscribeInput,
): Promise<IHealthAlert> {
  const req = await api.post<IHealthAlert>(
    "/workspace-health/alerts/subscribe",
    input,
  );
  return req.data;
}

export async function unsubscribeHealthAlert(
  subscriptionId: string,
): Promise<void> {
  await api.post("/workspace-health/alerts/unsubscribe", { subscriptionId });
}

export async function getKnowledgeGaps(
  params: IKnowledgeGapsQuery,
): Promise<IKnowledgeGapsResponse> {
  const req = await api.post<IKnowledgeGapsResponse>(
    "/workspace-health/gaps",
    params,
  );
  return req.data;
}

export async function exportHealthIssues(params: IHealthIssuesQuery): Promise<{
  blob: Blob;
  filename: string;
}> {
  const res = await api.post("/workspace-health/issues/export", params, {
    responseType: "blob",
  });
  const disposition = (res?.headers?.["content-disposition"] ?? "") as string;
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `doc-health-${params.category}.csv`;
  return { blob: res.data as Blob, filename };
}
