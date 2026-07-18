import { Button, Divider } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

/**
 * Shared-IdP OIDC sign-in (blueprint §9.1). Distinct from the per-workspace EE
 * SsoLogin: this is the suite-wide OIDC provider configured via OIDC_* env. The
 * button redirects to the server flow at /api/auth/oidc/login; rendered only
 * when OIDC is enabled at build/deploy time.
 */
export function ConqrSsoButton() {
  const { t } = useTranslation();
  const enabled = process.env.OIDC_ENABLED === "true";
  if (!enabled) return null;

  return (
    <>
      <Button
        onClick={() => {
          window.location.href = "/api/auth/oidc/login";
        }}
        leftSection={<IconLock size={16} />}
        variant="default"
        fullWidth
      >
        {t("Sign in with SSO")}
      </Button>
      <Divider my="xs" label="OR" labelPosition="center" />
    </>
  );
}
