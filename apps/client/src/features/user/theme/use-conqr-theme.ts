import { useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { ConqrThemePreference, conqrThemeAtom } from "./conqr-theme.ts";

/**
 * Theme preference with two homes, like ConqrPlan (profile.theme): the local
 * atom applies instantly and survives before the profile loads; the user
 * profile (settings.preferences.theme) makes it follow the user across
 * devices. Every change goes to both; ConqrThemeApplier pulls the profile
 * value back into the atom when the signed-in user changes.
 */
export function useConqrTheme(): [
  ConqrThemePreference,
  (
    next:
      | ConqrThemePreference
      | ((prev: ConqrThemePreference) => ConqrThemePreference),
  ) => void,
] {
  const [pref, setPrefAtom] = useAtom(conqrThemeAtom);
  const [user, setUser] = useAtom(userAtom);

  const setPref = useCallback(
    (
      next:
        | ConqrThemePreference
        | ((prev: ConqrThemePreference) => ConqrThemePreference),
    ) => {
      const resolved = typeof next === "function" ? next(pref) : next;
      setPrefAtom(resolved);

      if (!user) return;
      updateUser({
        theme: resolved.theme,
        themeCustom: resolved.theme === "custom" ? resolved.custom : undefined,
      })
        .then((updated) => setUser(updated))
        .catch(() => {
          /* local preference still applies; profile sync retries next change */
        });
    },
    [pref, user, setPrefAtom, setUser],
  );

  return [pref, setPref];
}

export function useProfileThemePreference(): ConqrThemePreference | undefined {
  const user = useAtomValue(userAtom);
  return user?.settings?.preferences?.theme;
}
