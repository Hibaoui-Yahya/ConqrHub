import { getSuiteAppUrls } from "@/lib/config.ts";

/**
 * The settings are one page for the whole suite. When ConqrMeet sends
 * someone here (`/settings/...?from=meet`), the "Back" button must return to
 * ConqrMeet, not to the Hub home. The origin is remembered for the session.
 */
const STORAGE_KEY = "conqr.settings.return";

export interface SettingsReturn {
  product: "ConqrHub" | "ConqrMeet";
  /** Absolute URL to return to; null means "stay in Hub". */
  url: string | null;
}

export function captureSettingsReturn(search: string): void {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  if (!from) return;
  try {
    if (from === "meet") {
      const meet = getSuiteAppUrls().meet ?? referrerOrigin();
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ product: "ConqrMeet", url: meet ?? null }),
      );
    } else if (from === "hub") {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* storage unavailable: the back button falls back to Hub */
  }
}

export function readSettingsReturn(): SettingsReturn {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SettingsReturn;
      if (parsed.product === "ConqrMeet") {
        return { product: "ConqrMeet", url: safeUrl(parsed.url) };
      }
    }
  } catch {
    /* ignore */
  }
  return { product: "ConqrHub", url: null };
}

export function clearSettingsReturn(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function referrerOrigin(): string | undefined {
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin !== window.location.origin) return ref.origin;
  } catch {
    /* ignore */
  }
  return undefined;
}

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
