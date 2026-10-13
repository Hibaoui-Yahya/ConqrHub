import api from "@/lib/api-client";
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
import { IPagination } from "@/lib/types";

export async function getVerificationInfo(
  pageId: string,
): Promise<IPageVerificationInfo> {
  const req = await api.post<IPageVerificationInfo>(
    "/pages/verification-info",
    { pageId },
  );
  return req.data;
}

export async function setupVerification(
  data: ISetupVerification,
): Promise<void> {
  await api.post("/pages/create-verification", data);
}

export async function updateVerification(
  data: IUpdateVerification,
): Promise<void> {
  await api.post("/pages/update-verification", data);
}

export async function removeVerification(pageId: string): Promise<void> {
  await api.post("/pages/delete-verification", { pageId });
}

export async function verifyPage(pageId: string): Promise<void> {
  await api.post("/pages/verify", { pageId });
}

export async function submitForApproval(pageId: string): Promise<void> {
  await api.post("/pages/submit-for-approval", { pageId });
}

export async function rejectApproval(data: {
  pageId: string;
  comment?: string;
}): Promise<void> {
  await api.post("/pages/reject-approval", data);
}

export async function markObsolete(pageId: string): Promise<void> {
  await api.post("/pages/mark-obsolete", { pageId });
}

export async function getVerificationList(
  params?: IVerificationListParams,
): Promise<IPagination<IVerificationListItem>> {
  const req = await api.post("/pages/verifications", { ...params });
  return req.data;
}

export async function getVerificationOverview(
  spaceId?: string,
): Promise<IVerificationOverview> {
  const req = await api.post<IVerificationOverview>(
    "/pages/verification-overview",
    spaceId ? { spaceId } : {},
  );
  return req.data;
}

export async function getUnverifiedPages(
  params?: IUnverifiedPagesParams,
): Promise<IUnverifiedPagesResponse> {
  const req = await api.post<IUnverifiedPagesResponse>("/pages/unverified", {
    ...params,
  });
  return req.data;
}

export async function bulkVerifyPages(
  params: IBulkVerifyParams,
): Promise<IBulkVerifyResult> {
  const req = await api.post<IBulkVerifyResult>("/pages/bulk-verify", params);
  return req.data;
}
