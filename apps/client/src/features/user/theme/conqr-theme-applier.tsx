import { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { useMantineColorScheme } from "@mantine/core";
import { conqrThemeAtom, schemeForTheme } from "./conqr-theme.ts";
import { useProfileThemePreference } from "./use-conqr-theme.ts";
import { applyHubCustomTheme, clearHubCustomTheme } from "@/lib/theme";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { cookieColorSchemeManager } from "@/lib/color-scheme-cookie.ts";

/**
 * Applies the saved Plane-style theme preference:
 *  - resolves it to Mantine's light/dark/auto scheme (which also syncs the
 *    shared `conqr-theme` cookie ConqrPlan reads),
 *  - stamps `data-conqr-theme` on <html> so the high-contrast token blocks
 *    in packages/tokens/tokens.css engage,
 *  - for "custom", derives neutral + brand OKLCH ramps from the two chosen
 *    colors (hue/chroma from the colors, lightness from the token sheet) and
 *    writes them as inline CSS variables on <html>.
 * Renders nothing; mount once inside MantineProvider.
 */
export default function ConqrThemeApplier() {
  const [pref, setPref] = useAtom(conqrThemeAtom);
  const profileTheme = useProfileThemePreference();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [user, setUser] = useAtom(userAtom);
  const migratedUser = useRef<string>();

  // Preserve an existing quick-menu Light/Dark choice that older builds only
  // kept in a host cookie. Future changes are saved through useConqrTheme.
  useEffect(() => {
    if (!user?.id || profileTheme?.theme || migratedUser.current === user.id)
      return;
    const savedScheme = cookieColorSchemeManager().get("auto");
    if (savedScheme !== "light" && savedScheme !== "dark") return;
    migratedUser.current = user.id;
    setPref({ theme: savedScheme });
    void updateUser({ theme: savedScheme })
      .then(setUser)
      .catch(() => {});
  }, [user?.id, profileTheme, setPref, setUser]);

  // Profile wins over the device-local copy whenever the signed-in user
  // (re)loads, so the theme follows the user across devices.
  useEffect(() => {
    if (!profileTheme?.theme) return;
    if (JSON.stringify(profileTheme) !== JSON.stringify(pref)) {
      setPref(profileTheme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTheme]);

  useEffect(() => {
    const scheme = schemeForTheme(pref);
    if (scheme !== colorScheme) setColorScheme(scheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pref]);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-conqr-theme", pref.theme);

    if (pref.theme === "custom" && pref.custom) {
      applyHubCustomTheme(
        pref.custom.primary,
        pref.custom.background,
        pref.custom.darkPalette ? "dark" : "light",
      );
    } else {
      clearHubCustomTheme();
    }
  }, [pref]);

  return null;
}
