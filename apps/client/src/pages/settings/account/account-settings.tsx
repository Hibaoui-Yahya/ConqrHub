import AccountNameForm from "@/features/user/components/account-name-form";
import ChangeEmail from "@/features/user/components/change-email";
import ChangePassword from "@/features/user/components/change-password";
import { Divider } from "@mantine/core";
import AccountAvatar from "@/features/user/components/account-avatar";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { AccountMfaSection } from "@/features/user/components/account-mfa-section";
import { isFeatureUnavailable, UNAVAILABLE } from "@/ee/unavailable-features";
import SessionList from "@/features/session/components/session-list";

export default function AccountSettings() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("My Profile")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle
        title={t("My Profile")}
        description={t(
          "Your name, your photo and the security of your account, for the whole suite.",
        )}
        scope="account"
      />

      <AccountAvatar />

      <AccountNameForm />

      <Divider my="lg" />

      <ChangeEmail />

      <Divider my="lg" />

      <ChangePassword />

      <Divider my="lg" />

      {!isFeatureUnavailable(UNAVAILABLE.MFA) && (
        <>
          <AccountMfaSection />
          <Divider my="lg" />
        </>
      )}

      <SessionList />
    </>
  );
}
