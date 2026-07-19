const APP_ROUTE = {
  HOME: "/home",
  SPACES: "/spaces",
  FAVORITES: "/favorites",
  SEARCH: "/search",
  AUTH: {
    LOGIN: "/login",
    SIGNUP: "/signup",
    SETUP: "/setup/register",
    FORGOT_PASSWORD: "/forgot-password",
    PASSWORD_RESET: "/password-reset",
    CREATE_WORKSPACE: "/create",
    SELECT_WORKSPACE: "/select",
    MFA_CHALLENGE: "/login/mfa",
    MFA_SETUP_REQUIRED: "/login/mfa/setup",
    VERIFY_EMAIL: "/verify-email",
  },
  SETTINGS: {
    ACCOUNT: {
      PROFILE: "/settings/account/profile",
      PREFERENCES: "/settings/account/preferences",
    },
    WORKSPACE: {
      GENERAL: "/settings/workspace",
      MEMBERS: "/settings/members",
      GROUPS: "/settings/groups",
      SPACES: "/settings/spaces",
      BILLING: "/settings/billing",
      SECURITY: "/settings/security",
    },
  },
};

export function getPostLoginRedirect(): string {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect) {
    try {
      const resolved = new URL(redirect, window.location.origin);
      if (resolved.origin === window.location.origin) {
        return resolved.pathname + resolved.search + resolved.hash;
      }
    } catch {
      // malformed URL, fall through to default
    }
  }
  return APP_ROUTE.HOME;
}

/**
 * Navigate to the post-login destination. Backend-served routes (e.g. the MCP
 * OAuth `/oauth/authorize` consent flow) are not React Router routes, so they
 * need a full page load rather than a client-side navigation.
 */
export function redirectAfterLogin(navigate: (to: string) => void): void {
  const target = getPostLoginRedirect();
  // Backend-served routes need a full page load: the MCP OAuth consent flow
  // (/oauth/*) and the suite IdP authorize endpoint (/api/idp/*) that signs
  // Plane in with the Hub identity.
  if (target.startsWith("/oauth/") || target.startsWith("/api/idp/")) {
    window.location.assign(target);
  } else {
    navigate(target);
  }
}

export default APP_ROUTE;
