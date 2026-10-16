import { Helmet } from "react-helmet-async";
import { getAppName, isCloud } from "@/lib/config.ts";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { Divider, Title } from "@mantine/core";
import React from "react";
import useUserRole from "@/hooks/use-user-role.tsx";
import SsoProviderList from "@/ee/security/components/sso-provider-list.tsx";
import CreateSsoProvider from "@/ee/security/components/create-sso-provider.tsx";
import EnforceSso from "@/ee/security/components/enforce-sso.tsx";
import AllowedDomains from "@/ee/security/components/allowed-domains.tsx";
import { useTranslation } from "react-i18next";
import EnforceMfa from "@/ee/security/components/enforce-mfa.tsx";
import DisablePublicSharing from "@/ee/security/components/disable-public-sharing.tsx";
import TrashRetention from "@/ee/security/components/trash-retention.tsx";

import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import {
  isFeatureUnavailable,
  UNAVAILABLE,
} from "@/ee/unavailable-features";

export default function Security() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const hasCustomSso = useHasFeature(Feature.SSO_CUSTOM);
  // Two-factor and single sign-on have no server side in this build: their
  // sections stay hidden rather than calling endpoints that answer 404.
  const showMfa = !isFeatureUnavailable(UNAVAILABLE.MFA);
  const showSso = !isFeatureUnavailable(UNAVAILABLE.SSO_CUSTOM);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>Security - {getAppName()}</title>
      </Helmet>
      <SettingsTitle
        title={t("Security and sign-in")}
        description={t(
          showSso
            ? "Sign-in rules for every member and single sign-on."
            : "Rules that apply to every member of the company.",
        )}
        scope="company"
      />

      {showMfa && (
        <>
          <EnforceMfa />
          <Divider my="lg" />
        </>
      )}

      <DisablePublicSharing />
      <Divider my="lg" />

      <TrashRetention />

      {showSso && (
        <>
          <Divider my="lg" />
          <Title order={4} my="lg">
            Single sign-on (SSO)
          </Title>

          <EnforceSso />
          <Divider my="lg" />

          {(isCloud() || hasCustomSso) && (
            <>
              <AllowedDomains />
              <Divider my="lg" />
            </>
          )}

          {hasCustomSso && (
            <>
              <CreateSsoProvider />
              <Divider size={0} my="lg" />
            </>
          )}

          <SsoProviderList />
        </>
      )}
    </>
  );
}
