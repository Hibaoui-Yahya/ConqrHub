import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  createInsight,
  deleteInsight,
  getMyInsightVotes,
  getPageInsights,
  publishInsight,
  retireInsight,
  searchInsights,
  updateInsight,
  voteInsight,
} from "../services/expertise-service";
import {
  IInsightInput,
  InsightStatus,
  InsightVote,
} from "../types/expertise.types";

const KEY = ["insights"];

export function useInsightSearchQuery(params: {
  query?: string;
  spaceId?: string;
  status?: InsightStatus;
}) {
  return useQuery({
    queryKey: [...KEY, "search", params],
    queryFn: () => searchInsights({ ...params, limit: 60 }),
    placeholderData: keepPreviousData,
  });
}

export function usePageInsightsQuery(pageId?: string) {
  return useQuery({
    queryKey: [...KEY, "page", pageId],
    queryFn: () => getPageInsights(pageId!),
    enabled: !!pageId,
  });
}

export function useMyInsightVotesQuery(insightIds: string[]) {
  return useQuery({
    queryKey: [...KEY, "my-votes", insightIds],
    queryFn: () => getMyInsightVotes(insightIds),
    enabled: insightIds.length > 0,
  });
}

function useInsightMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation<TResult, Error, TVars>({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      if (successMessage) notifications.show({ message: t(successMessage) });
    },
    onError: (error) => {
      const message = (error as any)?.response?.data?.message;
      notifications.show({
        message: message || t("The action failed. Please try again."),
        color: "red",
      });
    },
  });
}

export function useCreateInsightMutation() {
  return useInsightMutation(
    (data: IInsightInput & { pageId: string; spaceId: string }) =>
      createInsight(data),
    "Insight saved as a draft",
  );
}

export function useUpdateInsightMutation() {
  return useInsightMutation(
    (data: Partial<IInsightInput> & { insightId: string }) =>
      updateInsight(data),
    "Insight updated",
  );
}

export function usePublishInsightMutation() {
  return useInsightMutation(
    (insightId: string) => publishInsight(insightId),
    "Insight published",
  );
}

export function useRetireInsightMutation() {
  return useInsightMutation(
    (insightId: string) => retireInsight(insightId),
    "Insight retired",
  );
}

export function useDeleteInsightMutation() {
  return useInsightMutation(
    (insightId: string) => deleteInsight(insightId),
    "Insight deleted",
  );
}

export function useVoteInsightMutation() {
  return useInsightMutation(
    (vars: { insightId: string; vote: InsightVote | null }) =>
      voteInsight(vars.insightId, vars.vote),
  );
}
