import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  IBulkVerifyParams,
  IBulkVerifyResult,
  IPageVerificationInfo,
  ISetupVerification,
  IUnverifiedPagesParams,
  IUnverifiedPagesResponse,
  IUpdateVerification,
  IVerificationListItem,
  IVerificationListParams,
  IVerificationOverview,
} from "@/ee/page-verification/types/page-verification.types";
import {
  bulkVerifyPages,
  getUnverifiedPages,
  getVerificationInfo,
  getVerificationList,
  getVerificationOverview,
  markObsolete,
  rejectApproval,
  removeVerification,
  setupVerification,
  submitForApproval,
  updateVerification,
  verifyPage,
} from "@/ee/page-verification/services/page-verification-service";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { IPagination } from "@/lib/types";
import { getBulkVerifyReasonLabel } from "@/ee/page-verification/components/verification-status";

export function usePageVerificationInfoQuery(
  pageId: string | undefined,
): UseQueryResult<IPageVerificationInfo, Error> {
  return useQuery({
    queryKey: ["page-verification-info", pageId],
    queryFn: () => getVerificationInfo(pageId!),
    enabled: !!pageId,
  });
}

export function useSetupVerificationMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, ISetupVerification>({
    mutationFn: (data) => setupVerification(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", variables.pageId],
      });
      notifications.show({ message: t("Verification enabled") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to enable verification"),
        color: "red",
      });
    },
  });
}

export function useUpdateVerificationMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, IUpdateVerification>({
    mutationFn: (data) => updateVerification(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", variables.pageId],
      });
      notifications.show({ message: t("Verification updated") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to update verification"),
        color: "red",
      });
    },
  });
}

export function useRemoveVerificationMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, string>({
    mutationFn: (pageId) => removeVerification(pageId),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", pageId],
      });
      notifications.show({ message: t("Verification removed") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to remove verification"),
        color: "red",
      });
    },
  });
}

export function useVerifyPageMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, string>({
    mutationFn: (pageId) => verifyPage(pageId),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", pageId],
      });
      notifications.show({ message: t("Page verified") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to verify page"),
        color: "red",
      });
    },
  });
}

export function useSubmitForApprovalMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, string>({
    mutationFn: (pageId) => submitForApproval(pageId),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", pageId],
      });
      notifications.show({ message: t("Submitted for approval") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to submit for approval"),
        color: "red",
      });
    },
  });
}

export function useRejectApprovalMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, { pageId: string; comment?: string }>({
    mutationFn: (data) => rejectApproval(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", variables.pageId],
      });
      notifications.show({ message: t("Approval rejected") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to reject approval"),
        color: "red",
      });
    },
  });
}

export function useMarkObsoleteMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<void, Error, string>({
    mutationFn: (pageId) => markObsolete(pageId),
    onSuccess: (_, pageId) => {
      queryClient.invalidateQueries({
        queryKey: ["page-verification-info", pageId],
      });
      notifications.show({ message: t("Page marked as obsolete") });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to mark as obsolete"),
        color: "red",
      });
    },
  });
}

export function useVerificationListQuery(
  params?: IVerificationListParams,
): UseQueryResult<IPagination<IVerificationListItem>, Error> {
  return useQuery({
    queryKey: ["verification-list", params],
    queryFn: () => getVerificationList(params),
    placeholderData: keepPreviousData,
  });
}

export function useVerificationOverviewQuery(
  spaceId?: string,
  options?: { enabled?: boolean },
): UseQueryResult<IVerificationOverview, Error> {
  return useQuery({
    queryKey: ["verification-overview", spaceId ?? null],
    queryFn: () => getVerificationOverview(spaceId),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useUnverifiedPagesInfiniteQuery(
  params?: Omit<IUnverifiedPagesParams, "cursor">,
) {
  return useInfiniteQuery<IUnverifiedPagesResponse, Error>({
    queryKey: ["unverified-pages", params ?? {}],
    queryFn: ({ pageParam }) =>
      getUnverifiedPages({
        ...params,
        cursor: (pageParam as string | undefined) || undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor || undefined,
    placeholderData: keepPreviousData,
  });
}

export function useBulkVerifyMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<IBulkVerifyResult, Error, IBulkVerifyParams>({
    mutationFn: (data) => bulkVerifyPages(data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["unverified-pages"] });
      queryClient.invalidateQueries({ queryKey: ["verification-overview"] });
      queryClient.invalidateQueries({ queryKey: ["verification-list"] });
      for (const pageId of variables.pageIds) {
        queryClient.invalidateQueries({
          queryKey: ["page-verification-info", pageId],
        });
      }
      const verifiedCount = result?.verified?.length ?? 0;
      const failed = result?.failed ?? [];
      // Group failures by reason so the toast reads "2 × Page not found".
      const reasonCounts = new Map<string, number>();
      for (const f of failed) {
        const label = getBulkVerifyReasonLabel(f.reason, t);
        reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
      }
      const reasonSummary = Array.from(reasonCounts.entries())
        .map(([label, n]) => `${n} × ${label}`)
        .join(" · ");
      notifications.show({
        color: failed.length > 0 ? "yellow" : "teal",
        title: t("{{count}} page(s) verified", { count: verifiedCount }),
        message:
          failed.length > 0
            ? `${t("{{count}} page(s) could not be verified", {
                count: failed.length,
              })}${reasonSummary ? ` — ${reasonSummary}` : ""}`
            : undefined,
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to verify pages"),
        color: "red",
      });
    },
  });
}
