import { useState } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import {
  usePageVerificationInfoQuery,
  useVerifyPageMutation,
} from "@/ee/page-verification/queries/page-verification-query";
import { PageVerificationModal } from "@/ee/page-verification/components/page-verification-modal";

const STORAGE_PREFIX = "conqr.verification-stale-banner.dismissed:";

function isDismissed(pageId: string): boolean {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + pageId) === "1";
  } catch {
    return false;
  }
}

function dismiss(pageId: string): void {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + pageId, "1");
  } catch {
    // Storage unavailable (private mode, quota): the banner just stays.
  }
}

type Props = {
  pageId: string;
};

/**
 * Slim warning shown on a page that was verified once and has been edited
 * since: it is back to draft and no longer offered by Ask AI.
 */
export function VerificationStaleBanner({ pageId }: Props) {
  const { t, i18n } = useTranslation();
  const hasFeature = useHasFeature(Feature.PAGE_VERIFICATION);
  const { data: info } = usePageVerificationInfoQuery(
    hasFeature ? pageId : undefined,
  );
  const verifyMutation = useVerifyPageMutation();
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [dismissed, setDismissed] = useState(() => isDismissed(pageId));

  if (!hasFeature || !info || dismissed) return null;
  if (info.status !== "draft" || !info.verifiedAt) return null;

  const verifiedDate = new Date(info.verifiedAt);
  const dateText = isNaN(verifiedDate.getTime())
    ? ""
    : verifiedDate.toLocaleDateString(i18n.language || undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

  const canVerify = !!info.permissions?.canVerify;

  const handleDismiss = () => {
    dismiss(pageId);
    setDismissed(true);
  };

  return (
    <>
      <Alert
        color="yellow"
        variant="light"
        radius="md"
        icon={<IconAlertTriangle size={16} />}
        withCloseButton
        closeButtonLabel={t("Dismiss")}
        onClose={handleDismiss}
        py={6}
        mb="sm"
        className="print-hide"
      >
        <Group gap="sm" justify="space-between" wrap="wrap">
          <Text fz="sm">
            {t(
              "Modified since the last verification ({{date}}). It is no longer offered by Ask AI.",
              { date: dateText },
            )}
          </Text>
          {canVerify ? (
            <Button
              size="compact-xs"
              color="yellow"
              variant="filled"
              loading={verifyMutation.isPending}
              onClick={() => verifyMutation.mutate(pageId)}
            >
              {t("Re-verify")}
            </Button>
          ) : (
            <Button
              size="compact-xs"
              color="yellow"
              variant="outline"
              onClick={openModal}
            >
              {t("Request a verification")}
            </Button>
          )}
        </Group>
      </Alert>
      {!canVerify && (
        <PageVerificationModal
          pageId={pageId}
          opened={modalOpened}
          onClose={closeModal}
        />
      )}
    </>
  );
}
