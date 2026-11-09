import { VerificationStatus } from "@/ee/page-verification/types/page-verification.types";

export function getStatusColor(status: VerificationStatus): string {
  switch (status) {
    case "verified":
    case "approved":
      return "blue.7";
    case "expiring":
    case "in_approval":
      return "orange.8";
    case "expired":
      return "red.7";
    case "draft":
    case "obsolete":
      return "gray.6";
    default:
      return "gray.6";
  }
}

export function getStatusLabel(
  status: VerificationStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "verified":
      return t("Verified");
    case "expiring":
      return t("Review needed");
    case "expired":
      return t("Verification expired");
    case "draft":
      return t("Draft");
    case "in_approval":
      return t("In Approval");
    case "approved":
      return t("Approved");
    case "obsolete":
      return t("Obsolete");
    default:
      return "";
  }
}

/** Human label for a `bulk-verify` failure reason code. */
export function getBulkVerifyReasonLabel(
  reason: string | undefined,
  t: (key: string) => string,
): string {
  switch (reason) {
    case "not_found":
      return t("Page not found");
    case "forbidden":
      return t("You are not allowed to verify this page");
    case "verifier_limit":
      return t("Verifier limit reached for this page");
    case "invalid_state":
      return t("This page cannot be verified in its current state");
    case "error":
      return t("An unexpected error occurred");
    default:
      return reason || t("An unexpected error occurred");
  }
}
