import { Feature } from "@/ee/features";

/**
 * Features the server licence reports as enabled but that have no server
 * implementation in ConqrHub (their endpoints answer 404). Sign-in for the
 * suite goes through the ConqrAI identity provider instead.
 *
 * This list is the single place that hides them: `useHasFeature` answers
 * false for them, and every entry point (settings rail, routes, sections)
 * checks `isFeatureUnavailable` to disappear instead of showing a disabled
 * "upgrade" control. Remove an entry once its endpoints exist.
 */
export const UNAVAILABLE = {
  MFA: Feature.MFA,
  SSO_CUSTOM: Feature.SSO_CUSTOM,
  SSO_GOOGLE: Feature.SSO_GOOGLE,
  SCIM: Feature.SCIM,
  /** Licence activation screen (`/license/*`). Not a licence feature key. */
  LICENSE: "license",
} as const;

const UNAVAILABLE_SET: ReadonlySet<string> = new Set(Object.values(UNAVAILABLE));

export function isFeatureUnavailable(feature: string): boolean {
  return UNAVAILABLE_SET.has(feature);
}

/** Entitlements without the features this build cannot serve. */
export function withoutUnavailable(features: string[] | undefined): string[] {
  return (features ?? []).filter((f) => !UNAVAILABLE_SET.has(f));
}
