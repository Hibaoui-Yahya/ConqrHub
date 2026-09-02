import { useQuery } from "@tanstack/react-query";
import { getPageAttachments } from "@/features/attachments/services/attachment-service.ts";
import { IPageAttachmentsResponse } from "@/features/attachments/types/attachment.types.ts";

export function usePageAttachmentsQuery(pageId?: string) {
  return useQuery<IPageAttachmentsResponse>({
    queryKey: ["page-attachments", pageId],
    queryFn: () => getPageAttachments(pageId as string),
    enabled: !!pageId,
    staleTime: 15_000,
  });
}
