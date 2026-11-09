import api from "@/lib/api-client";
import {
  IInsight,
  IInsightInput,
  IInsightSearchItem,
  IInsightVoteResult,
  InsightStatus,
  InsightVote,
} from "../types/expertise.types";

export async function searchInsights(params: {
  query?: string;
  spaceId?: string;
  status?: InsightStatus;
  limit?: number;
}): Promise<IInsightSearchItem[]> {
  const req = await api.post<{ items: IInsightSearchItem[] }>(
    "/insights/search",
    params,
  );
  return req.data.items;
}

export async function getPageInsights(pageId: string): Promise<IInsight[]> {
  const req = await api.post<IInsight[]>("/insights/list", { pageId });
  return req.data;
}

export async function createInsight(
  data: IInsightInput & { pageId: string; spaceId: string },
): Promise<IInsight> {
  const req = await api.post<IInsight>("/insights/create", data);
  return req.data;
}

export async function updateInsight(
  data: Partial<IInsightInput> & { insightId: string },
): Promise<IInsight> {
  const req = await api.post<IInsight>("/insights/update", data);
  return req.data;
}

export async function publishInsight(insightId: string): Promise<IInsight> {
  const req = await api.post<IInsight>("/insights/publish", { insightId });
  return req.data;
}

export async function retireInsight(insightId: string): Promise<IInsight> {
  const req = await api.post<IInsight>("/insights/retire", { insightId });
  return req.data;
}

export async function deleteInsight(insightId: string): Promise<void> {
  await api.post("/insights/delete", { insightId });
}

export async function voteInsight(
  insightId: string,
  vote: InsightVote | null,
): Promise<IInsightVoteResult> {
  const req = await api.post<IInsightVoteResult>("/insights/vote", {
    insightId,
    vote,
  });
  return req.data;
}

export async function getMyInsightVotes(
  insightIds: string[],
): Promise<Record<string, InsightVote>> {
  const req = await api.post<Record<string, InsightVote>>("/insights/my-votes", {
    insightIds,
  });
  return req.data;
}
