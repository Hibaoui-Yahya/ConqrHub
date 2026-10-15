import { Helmet } from "react-helmet-async";
import { PasswordResetForm } from "@/features/auth/components/password-reset-form";
import { Link, useSearchParams } from "react-router-dom";
import { useVerifyUserTokenQuery } from "@/features/auth/queries/auth-query";
import { Button } from "@mantine/core";
import { IconLinkOff } from "@tabler/icons-react";
import {
  AuthHeading,
  AuthLayout,
  BackToLogin,
  authClasses,
} from "@/features/auth/components/auth-layout.tsx";
import APP_ROUTE from "@/lib/app-route";
import { getAppName } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";

export default function PasswordReset() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { data, isLoading, isError } = useVerifyUserTokenQuery({
    token: searchParams.get("token"),
    type: "forgot-password",
  });
  const resetToken = searchParams.get("token");

  if (isLoading) {
    return <div></div>;
  }

  if (isError || !resetToken) {
    return (
      <>
        <Helmet>
          <title>
            {t("Password Reset")} - {getAppName()}
          </title>
        </Helmet>
        <AuthLayout>
          <AuthHeading
            icon={<IconLinkOff size={22} />}
            title={t("This link is no longer valid")}
            subtitle={t(
              "Reset links work once and expire after 30 minutes. Ask for a new one.",
            )}
          />
          <Button
            component={Link}
            to={APP_ROUTE.AUTH.FORGOT_PASSWORD}
            fullWidth
            size="md"
            className={authClasses.primary}
          >
            {t("Send a new link")}
          </Button>
          <BackToLogin />
        </AuthLayout>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>
          {t("Password Reset")} - {getAppName()}
        </title>
      </Helmet>
      <PasswordResetForm resetToken={resetToken} />
    </>
  );
}
