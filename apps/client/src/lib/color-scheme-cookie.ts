import type {
  MantineColorScheme,
  MantineColorSchemeManager,
} from "@mantine/core";

/**
 * Cross-product theme sync for the Conqr suite.
 *
 * Mantine's color scheme is persisted to a `conqr-theme` cookie scoped to the
 * bare `localhost` host (cookies ignore the port), so ConqrHub and Plane —
 * which run on different ports of the same host — read and write the same
 * value. Switching dark/light in one app is picked up by the other, so the two
 * products feel like one platform. Values: "light" | "dark" | "auto"
 * ("auto" maps to Plane's "system").
 */
const COOKIE = "conqr-theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : undefined;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

function isScheme(v: unknown): v is MantineColorScheme {
  return v === "light" || v === "dark" || v === "auto";
}

export function cookieColorSchemeManager(): MantineColorSchemeManager {
  let onVisibility: (() => void) | undefined;

  return {
    get(defaultValue) {
      const v = readCookie(COOKIE);
      return isScheme(v) ? v : defaultValue;
    },
    set(value) {
      try {
        writeCookie(COOKIE, value, ONE_YEAR);
      } catch {
        /* cookies unavailable — non-fatal */
      }
    },
    subscribe(onUpdate) {
      // Re-read when the tab regains focus, so a change made in the other
      // Conqr app (e.g. Plane) is applied when the user returns here.
      onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        const v = readCookie(COOKIE);
        if (isScheme(v)) onUpdate(v);
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onVisibility);
    },
    unsubscribe() {
      if (onVisibility) {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onVisibility);
      }
    },
    clear() {
      writeCookie(COOKIE, "", 0);
    },
  };
}
