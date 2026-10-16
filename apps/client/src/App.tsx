import { Navigate, Route, Routes } from "react-router-dom";
import SetupWorkspace from "@/pages/auth/setup-workspace.tsx";
import LoginPage from "@/pages/auth/login";
import PlaneDocsRedirect from "@/pages/integration/plane-docs-redirect";
import IntegrationsSettings from "@/pages/settings/integrations/integrations-settings";
import Home from "@/pages/dashboard/home";
import Page from "@/pages/page/page";
import AccountSettings from "@/pages/settings/account/account-settings";
import WorkspaceMembers from "@/pages/settings/workspace/workspace-members";
import WorkspaceSettings from "@/pages/settings/workspace/workspace-settings";
import GroupInfo from "./pages/settings/group/group-info";
import AccountMeetings from "@/pages/settings/account/account-meetings.tsx";
import AccountNotifications from "@/pages/settings/account/account-notifications.tsx";
import HubAppSettings from "@/pages/settings/apps/hub-app-settings.tsx";
import MeetAppSettings from "@/pages/settings/apps/meet-app-settings.tsx";
import Connections from "@/pages/settings/connections/connections.tsx";
import Spaces from "@/pages/settings/space/spaces.tsx";
import { Error404 } from "@/components/ui/error-404.tsx";
import AccountPreferences from "@/pages/settings/account/account-preferences.tsx";
import SpaceHome from "@/pages/space/space-home.tsx";
import PageRedirect from "@/pages/page/page-redirect.tsx";
import Layout from "@/components/layouts/global/layout.tsx";
import InviteSignup from "@/pages/auth/invite-signup.tsx";
import ForgotPassword from "@/pages/auth/forgot-password.tsx";
import PasswordReset from "./pages/auth/password-reset";
import Billing from "@/ee/billing/pages/billing.tsx";
import CloudLogin from "@/ee/pages/cloud-login.tsx";
import CreateWorkspace from "@/ee/pages/create-workspace.tsx";
import { isCloud } from "@/lib/config.ts";
import { useTranslation } from "react-i18next";
import Security from "@/ee/security/pages/security.tsx";
import License from "@/ee/licence/pages/license.tsx";
import { isFeatureUnavailable, UNAVAILABLE } from "@/ee/unavailable-features";
import { useRedirectToCloudSelect } from "@/ee/hooks/use-redirect-to-cloud-select.tsx";
import SharedPage from "@/pages/share/shared-page.tsx";
import PdfRenderPage from "@/ee/pdf-export/pdf-render-page.tsx";
import Shares from "@/pages/settings/shares/shares.tsx";
import ShareLayout from "@/features/share/components/share-layout.tsx";
import ShareRedirect from "@/pages/share/share-redirect.tsx";
import { useTrackOrigin } from "@/hooks/use-track-origin";
import SpacesPage from "@/pages/spaces/spaces.tsx";
import { MfaChallengePage } from "@/ee/mfa/pages/mfa-challenge-page";
import { MfaSetupRequiredPage } from "@/ee/mfa/pages/mfa-setup-required-page";
import SpaceTrash from "@/pages/space/space-trash.tsx";
import UserApiKeys from "@/ee/api-key/pages/user-api-keys";
import WorkspaceApiKeys from "@/ee/api-key/pages/workspace-api-keys";
import AiSettings from "@/ee/ai/pages/ai-settings.tsx";
import AuditLogs from "@/ee/audit/pages/audit-logs.tsx";
import VerifiedPages from "@/ee/page-verification/pages/verified-pages.tsx";
import KnowledgeBasePage from "@/ee/page-verification/pages/knowledge-base.tsx";
import DocHealthPage from "@/features/doc-health/pages/doc-health-page.tsx";
import TemplateList from "@/ee/template/pages/template-list";
import NotificationsPage from "@/features/notification/pages/notifications-page";
import TemplateEditor from "@/ee/template/pages/template-editor";
import FavoritesPage from "@/pages/favorites/favorites-page";
import AiChat from "@/ee/ai-chat/pages/ai-chat.tsx";
import VerifyEmail from "@/ee/pages/verify-email.tsx";
import WelcomePage from "@/features/first-run/welcome-page.tsx";
import { UserProvider } from "@/features/user/user-provider.tsx";

export default function App() {
  const { t } = useTranslation();
  useRedirectToCloudSelect();
  useTrackOrigin();

  return (
    <>
      <Routes>
        <Route index element={<Navigate to="/home" />} />
        <Route path={"/login"} element={<LoginPage />} />
        <Route path={"/invites/:invitationId"} element={<InviteSignup />} />
        <Route
          path={"/welcome"}
          element={
            <UserProvider>
              <WelcomePage />
            </UserProvider>
          }
        />
        <Route path={"/forgot-password"} element={<ForgotPassword />} />
        <Route path={"/password-reset"} element={<PasswordReset />} />
        <Route path={"/login/mfa"} element={<MfaChallengePage />} />
        <Route path={"/login/mfa/setup"} element={<MfaSetupRequiredPage />} />

        {!isCloud() && (
          <Route path={"/setup/register"} element={<SetupWorkspace />} />
        )}

        {isCloud() && (
          <>
            <Route path={"/create"} element={<CreateWorkspace />} />
            <Route path={"/select"} element={<CloudLogin />} />
            <Route path={"/verify-email"} element={<VerifyEmail />} />
          </>
        )}

        <Route element={<ShareLayout />}>
          <Route
            path={"/share/:shareId/p/:pageSlug"}
            element={<SharedPage />}
          />
          <Route path={"/share/p/:pageSlug"} element={<SharedPage />} />
        </Route>

        <Route path={"/pdf-render/:pageId"} element={<PdfRenderPage />} />
        <Route path={"/share/:shareId"} element={<ShareRedirect />} />
        <Route path={"/p/:pageSlug"} element={<PageRedirect />} />

        <Route element={<Layout />}>
          <Route path={"/home"} element={<Home />} />
          <Route
            path={"/plane-docs/:projectId"}
            element={<PlaneDocsRedirect />}
          />
          <Route path={"/ai"} element={<AiChat />} />
          <Route path={"/ai/chat/:chatId"} element={<AiChat />} />
          <Route path={"/spaces"} element={<SpacesPage />} />
          <Route path={"/favorites"} element={<FavoritesPage />} />
          <Route path={"/notifications"} element={<NotificationsPage />} />
          <Route path={"/templates"} element={<TemplateList />} />
          <Route
            path={"/templates/:templateId"}
            element={<TemplateEditor />}
          />
          <Route path={"/s/:spaceSlug"} element={<SpaceHome />} />
          <Route path={"/s/:spaceSlug/trash"} element={<SpaceTrash />} />
          <Route
            path={"/s/:spaceSlug/p/:pageSlug"}
            element={<Page />}
          />


          <Route path={"/settings"}>
            {/* One settings page for the whole suite: /settings lands on the
                profile; ConqrMeet sends people here with ?from=meet. */}
            <Route index element={<Navigate to="/settings/account/profile" replace />} />
            <Route path={"account/profile"} element={<AccountSettings />} />
            <Route
              path={"account/preferences"}
              element={<AccountPreferences />}
            />
            <Route path={"account/meetings"} element={<AccountMeetings />} />
            <Route
              path={"account/notifications"}
              element={<AccountNotifications />}
            />
            <Route path={"account/api-keys"} element={<UserApiKeys />} />
            <Route path={"workspace"} element={<WorkspaceSettings />} />
            <Route path={"members"} element={<WorkspaceMembers />} />
            <Route path={"api-keys"} element={<WorkspaceApiKeys />} />
            {/* Groups became a tab of "Members and groups". */}
            <Route
              path={"groups"}
              element={<Navigate to="/settings/members?tab=groups" replace />}
            />
            <Route path={"groups/:groupId"} element={<GroupInfo />} />
            <Route path={"apps/hub"} element={<HubAppSettings />} />
            <Route path={"apps/meet"} element={<MeetAppSettings />} />
            <Route path={"connections"} element={<Connections />} />
            <Route path={"spaces"} element={<Spaces />} />
            <Route path={"sharing"} element={<Shares />} />
            <Route path={"security"} element={<Security />} />
            <Route path={"ai"} element={<AiSettings />} />
            <Route path={"ai/mcp"} element={<AiSettings />} />
            <Route path={"audit"} element={<AuditLogs />} />
            <Route path={"knowledge-base"} element={<KnowledgeBasePage />} />
            <Route path={"verifications"} element={<VerifiedPages />} />
            <Route path={"health"} element={<DocHealthPage />} />
            <Route path={"integrations"} element={<IntegrationsSettings />} />
            {!isCloud() && !isFeatureUnavailable(UNAVAILABLE.LICENSE) && (
              <Route path={"license"} element={<License />} />
            )}
            {isCloud() && <Route path={"billing"} element={<Billing />} />}
          </Route>
        </Route>

        <Route path="*" element={<Error404 />} />
      </Routes>
    </>
  );
}
