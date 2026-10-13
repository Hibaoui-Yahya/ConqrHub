import { Alert, Button } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

type Props = {
  error: string;
  canRetry: boolean;
  onRetry: () => void;
  compact?: boolean;
};

/** Inline alert shown when a chat stream fails, with a retry action. */
export default function ChatStreamError({
  error,
  canRetry,
  onRetry,
  compact,
}: Props) {
  const { t } = useTranslation();
  return (
    <Alert
      color="red"
      variant="light"
      radius="md"
      icon={<IconAlertCircle size={16} />}
      title={compact ? undefined : t("The assistant could not answer")}
      p={compact ? "xs" : "sm"}
      styles={{ message: { fontSize: "var(--mantine-font-size-xs)" } }}
    >
      <div>{error}</div>
      {canRetry && (
        <Button
          mt={6}
          size="compact-xs"
          variant="light"
          color="red"
          leftSection={<IconRefresh size={12} />}
          onClick={onRetry}
        >
          {t("Retry")}
        </Button>
      )}
    </Alert>
  );
}
