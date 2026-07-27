"use client";

/**
 * ConqrService launcher — the suite-wide entry point for help, requests, bug
 * reports and ideas.
 *
 * CANONICAL FILE — vendored byte-identical into all three host apps:
 *   ConqrHub    apps/client/src/components/conqr-service-launcher.tsx
 *   ConqrPlane  apps/web/core/components/navigation/conqr-service-launcher.tsx
 *   ConqrMeet   apps/client/src/shell/conqr-service-launcher.tsx
 * Edit it in one repo, copy it to the other two. Do not fork it per app: the
 * point is that help looks and behaves the same everywhere in the suite.
 *
 * Two triggers, one panel. The header button (built per app from the exports
 * here) and the floating bubble both dispatch the same window event, so the
 * panel can never open twice, and Alt+S works from anywhere.
 *
 * Failure is a first-class state. The panel keeps the iframe hidden until
 * ConqrService says it is ready, so a wrong origin, a stopped dev server or a
 * misrouted domain shows our own "can't reach ConqrService" card instead of
 * the browser's error page framed in suite chrome.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** ConqrService orange — the same value the suite app switcher uses. */
const SERVICE_BRAND = "#e8590c";
/** Dev-only fallback. Never used in a production build: an unconfigured
 *  deployment hides the launcher rather than framing a dead origin. */
const DEV_SERVICE_URL = "http://localhost:5175";
/** How long ConqrService gets to complete its ready handshake. */
const READY_TIMEOUT_MS = 8000;

export const CONQR_SERVICE_TOGGLE_EVENT = "conqr-service:toggle";

type ToggleDetail = { open?: boolean };

/** Open, close or toggle the launcher panel from anywhere (header button,
 *  empty states, "report a problem" links in error boundaries…). */
export function toggleConqrService(open?: boolean): void {
  window.dispatchEvent(
    new CustomEvent<ToggleDetail>(CONQR_SERVICE_TOGGLE_EVENT, {
      detail: { open },
    }),
  );
}

type ViteEnv = Record<string, string | boolean | undefined>;

function viteEnv(): ViteEnv {
  try {
    return ((import.meta as ImportMeta & { env?: ViteEnv }).env ?? {}) as ViteEnv;
  } catch {
    return {};
  }
}

/**
 * Only some of the host apps have Node types in their client tsconfig, and the
 * text `process.env` has to survive verbatim (see below). A local ambient
 * declaration shadows the global where there is one and supplies it where
 * there isn't, so this file compiles unchanged in all three repos.
 */
declare const process: { env?: Record<string, string | undefined> };

/**
 * ConqrHub injects suite URLs by replacing the literal text `process.env` with
 * an object literal at build time (vite `define`). Guarding that read with
 * `typeof process !== "undefined"` silently defeats it — `process` itself is
 * never defined in the browser, so the guard is false and the injected object
 * is discarded. Read it directly, keeping `process.env` intact for the
 * substitution, and let the try/catch cover the apps where there is no define
 * and evaluating it throws.
 */
function defineInjectedServiceUrl(): string | undefined {
  try {
    return process.env?.SERVICE_APP_URL;
  } catch {
    return undefined;
  }
}

/**
 * Resolve the ConqrService origin. Each host app names the variable after its
 * own convention, so all of them are read here and this file stays identical
 * across the three repos. Returns null when nothing is configured — callers
 * must then render no launcher at all.
 */
export function resolveConqrServiceUrl(explicit?: string | null): string | null {
  const env = viteEnv();
  const candidates = [
    explicit,
    env.VITE_CONQR_SERVICE_URL as string | undefined, // ConqrPlane
    env.VITE_SERVICE_URL as string | undefined, // ConqrMeet
    defineInjectedServiceUrl(), // ConqrHub
  ];
  const configured = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  if (configured) return configured.trim().replace(/\/+$/, "");
  return env.DEV ? DEV_SERVICE_URL : null;
}

function hostIsDark(): boolean {
  const el = document.documentElement;
  return (
    el.classList.contains("dark") ||
    el.dataset.mantineColorScheme === "dark" ||
    /(?:^|;\s*)conqr-theme=dark(?:;|$)/.test(document.cookie) ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** Lifebuoy. Inlined so every app draws the exact same glyph without pulling
 *  in that app's icon library. */
export function ConqrServiceIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.6" />
      <path d="m5.7 5.7 3.8 3.8m5 5 3.8 3.8m0-12.6-3.8 3.8m-5 5-3.8 3.8" />
    </svg>
  );
}

export const CONQR_SERVICE_TRIGGER_LABEL = "Help & requests";
export const CONQR_SERVICE_TRIGGER_TITLE = "Help & requests — ConqrService (Alt+S)";

type Palette = {
  surface: string;
  border: string;
  text: string;
  muted: string;
  backdrop: string;
  shadow: string;
  hover: string;
};

function palette(dark: boolean): Palette {
  return dark
    ? {
        surface: "#1a1b1e",
        border: "rgba(255,255,255,.10)",
        text: "#e7e9ea",
        muted: "#9ca3af",
        backdrop: "rgba(0,0,0,.55)",
        shadow: "0 24px 70px rgba(0,0,0,.55)",
        hover: "rgba(255,255,255,.08)",
      }
    : {
        surface: "#ffffff",
        border: "rgba(15,23,42,.10)",
        text: "#1f2225",
        muted: "#6b7280",
        backdrop: "rgba(15,23,42,.32)",
        shadow: "0 24px 70px rgba(15,23,42,.24)",
        hover: "rgba(15,23,42,.06)",
      };
}

/**
 * What the user is looking at when they ask for help. ConqrService allow-lists
 * exactly these keys on its side and shows them back as removable chips before
 * anything is sent, so the host may pass them freely — but only these, and only
 * identifiers: never a title, never page content.
 */
export type ConqrServiceContext = {
  /** Stable cross-product name, e.g. `conqr://hub/page/<slugId>`. */
  entityUrn?: string;
  /** `page`, `work-item`, `meeting`… */
  entityType?: string;
  /** Area of the host app, e.g. `spaces`, `cycles`. */
  module?: string;
};

export function ConqrServiceLauncher({
  productId,
  serviceUrl,
  context,
}: {
  productId: string;
  /** Runtime override (ConqrMeet passes the URL its BFF reports). */
  serviceUrl?: string | null;
  /** Recomputed by the host on every render, so it always describes the
   *  screen the user is on at the moment they open the panel. */
  context?: ConqrServiceContext;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const resolvedUrl = resolveConqrServiceUrl(serviceUrl);

  useEffect(() => {
    // Never double-mount alongside the standalone embed runtime.
    if (document.querySelector("[data-conqr-service-runtime]")) return;
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    const target = returnFocusRef.current ?? buttonRef.current;
    window.setTimeout(() => target?.focus(), 0);
  }, []);

  const show = useCallback(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStatus("loading");
    setAttempt((value) => value + 1);
    setOpen(true);
  }, []);

  // Header button, keyboard shortcut and any other caller share this panel.
  useEffect(() => {
    const onToggle = (event: Event) => {
      const wanted = (event as CustomEvent<ToggleDetail>).detail?.open;
      const next = wanted === undefined ? !open : wanted;
      if (next) show();
      else close();
    };
    window.addEventListener(CONQR_SERVICE_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(CONQR_SERVICE_TOGGLE_EVENT, onToggle);
  }, [open, show, close]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) close();
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (open) close();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, show, close]);

  // Reachability + the ready handshake. Both guard the same thing: the user
  // must never see a foreign error page inside suite chrome.
  useEffect(() => {
    if (!open || !resolvedUrl) return undefined;
    let live = true;
    const fail = () => {
      if (live) setStatus((current) => (current === "ready" ? current : "error"));
    };
    // A refused connection, dead DNS or bad certificate rejects here in
    // milliseconds — long before the timeout — so the failure feels instant.
    void fetch(`${resolvedUrl}/api/health`, { mode: "no-cors", cache: "no-store" }).catch(fail);
    const timer = window.setTimeout(fail, READY_TIMEOUT_MS);
    let origin = "";
    try {
      origin = new URL(resolvedUrl, window.location.href).origin;
    } catch {
      origin = "";
    }
    const onMessage = (event: MessageEvent) => {
      if (!origin || event.origin !== origin) return;
      const data = event.data as { source?: string; type?: string } | null;
      if (!data || data.source !== "conqr-service") return;
      if (data.type === "ready") setStatus("ready");
      if (data.type === "close") close();
    };
    window.addEventListener("message", onMessage);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [open, resolvedUrl, attempt, close]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, attempt]);

  // An unconfigured deployment gets no launcher rather than a broken one.
  if (!mounted || !resolvedUrl) return null;

  const dark = hostIsDark();
  const colors = palette(dark);
  // Only the keys ConqrService allow-lists, and only when the host filled them
  // in: an empty value must not become an empty chip in the intake form.
  const entityContext = (["entityUrn", "entityType", "module"] as const)
    .map((key) => [key, context?.[key]] as const)
    .filter((pair): pair is readonly [(typeof pair)[0], string] => Boolean(pair[1]))
    .map(([key, value]) => `&${key}=${encodeURIComponent(value)}`)
    .join("");
  const panelUrl =
    `${resolvedUrl}/launcher` +
    `?product=${encodeURIComponent(productId)}` +
    `&theme=${dark ? "dark" : "light"}` +
    `&embedded=1` +
    `&route=${encodeURIComponent(window.location.pathname + window.location.search)}` +
    `&locale=${encodeURIComponent(navigator.language)}` +
    `&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}` +
    entityContext;

  const iconButton = (label: string, onClick: () => void, children: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        display: "grid",
        placeItems: "center",
        border: 0,
        borderRadius: 6,
        background: "transparent",
        color: colors.muted,
        cursor: "pointer",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = colors.hover;
        event.currentTarget.style.color = colors.text;
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
        event.currentTarget.style.color = colors.muted;
      }}
    >
      {children}
    </button>
  );

  return createPortal(
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
          }}
        >
          <button
            aria-label="Close ConqrService"
            onClick={close}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              padding: 0,
              border: 0,
              background: colors.backdrop,
              backdropFilter: "blur(2px)",
              cursor: "default",
              animation: "cqr-fade 140ms ease",
            }}
          />

          <section
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="ConqrService — help and requests"
            data-conqr-service-panel
            style={{
              position: "absolute",
              right: "max(24px, env(safe-area-inset-right))",
              bottom: "calc(84px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              width: "min(400px, calc(100vw - 32px))",
              height: "min(560px, calc(100vh - 120px))",
              overflow: "hidden",
              border: `1px solid ${colors.border}`,
              borderRadius: 18,
              background: colors.surface,
              boxShadow: colors.shadow,
              transformOrigin: "bottom right",
              animation: "cqr-pop 170ms cubic-bezier(.2,.9,.3,1.2)",
              outline: "none",
            }}
          >
            {/* Panel chrome: says which product answers, and gives a way out
                of the frame (full app) as well as a way to close it. */}
            <header
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flex: "0 0 auto",
                height: 44,
                padding: "0 8px 0 14px",
                borderBottom: `1px solid ${colors.border}`,
                color: colors.text,
                font: "600 13px/1 'Inter Variable', Inter, system-ui, sans-serif",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: SERVICE_BRAND,
                  flex: "0 0 auto",
                }}
              />
              ConqrService
              <span style={{ flex: 1 }} />
              {iconButton("Open ConqrService in a new tab", () => {
                window.open(resolvedUrl, "_blank", "noopener,noreferrer");
              }, (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
                </svg>
              ))}
              {iconButton("Close", close, (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              ))}
            </header>

            <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
              <iframe
                key={attempt}
                title="ConqrService — help and requests"
                src={panelUrl}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  border: 0,
                  background: colors.surface,
                  opacity: status === "ready" ? 1 : 0,
                  transition: "opacity 120ms ease",
                }}
              />

              {status !== "ready" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    padding: 24,
                    background: colors.surface,
                    textAlign: "center",
                    color: colors.text,
                    font: "400 13px/1.5 'Inter Variable', Inter, system-ui, sans-serif",
                  }}
                >
                  {status === "loading" ? (
                    <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          border: `2px solid ${colors.border}`,
                          borderTopColor: SERVICE_BRAND,
                          animation: "cqr-spin 700ms linear infinite",
                        }}
                      />
                      <span style={{ color: colors.muted }}>Connecting to ConqrService…</span>
                    </div>
                  ) : (
                    <div style={{ display: "grid", justifyItems: "center", gap: 10, maxWidth: 300 }}>
                      <span style={{ color: SERVICE_BRAND }}>
                        <ConqrServiceIcon size={26} />
                      </span>
                      <strong style={{ font: "650 15px/1.3 inherit" }}>Can&rsquo;t reach ConqrService</strong>
                      <span style={{ color: colors.muted }}>
                        {resolvedUrl.startsWith("http://localhost")
                          ? "The local ConqrService isn't running. Start it, or point SERVICE_APP_URL at a deployed instance."
                          : "The service didn't respond. It may be restarting, or this workspace points at the wrong ConqrService URL."}
                      </span>
                      <code
                        style={{
                          font: "400 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
                          color: colors.muted,
                          wordBreak: "break-all",
                        }}
                      >
                        {resolvedUrl}
                      </code>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setStatus("loading");
                            setAttempt((value) => value + 1);
                          }}
                          style={{
                            padding: "7px 14px",
                            border: `1px solid ${colors.border}`,
                            borderRadius: 8,
                            background: "transparent",
                            color: colors.text,
                            font: "500 13px/1 inherit",
                            cursor: "pointer",
                          }}
                        >
                          Try again
                        </button>
                        <button
                          type="button"
                          onClick={() => window.open(resolvedUrl, "_blank", "noopener,noreferrer")}
                          style={{
                            padding: "7px 14px",
                            border: 0,
                            borderRadius: 8,
                            background: dark ? "#f8fafc" : "#111827",
                            color: dark ? "#111827" : "#ffffff",
                            font: "500 13px/1 inherit",
                            cursor: "pointer",
                          }}
                        >
                          Open in new tab
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Floating trigger, bottom-right — the same bubble in every app. */}
      <div
        data-conqr-service-launcher
        style={{
          position: "fixed",
          right: "max(24px, env(safe-area-inset-right))",
          bottom: "max(24px, env(safe-area-inset-bottom))",
          zIndex: 2147483001,
        }}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={open ? "Close help and requests" : CONQR_SERVICE_TRIGGER_LABEL}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={CONQR_SERVICE_TRIGGER_TITLE}
          onClick={() => (open ? close() : show())}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: 52,
            height: 52,
            display: "grid",
            placeItems: "center",
            border: 0,
            borderRadius: "50%",
            background: dark ? "#f8fafc" : "#111827",
            color: dark ? "#111827" : "#ffffff",
            cursor: "pointer",
            boxShadow: hovered ? "0 12px 28px rgba(15,23,42,.34)" : "0 8px 20px rgba(15,23,42,.26)",
            transform: hovered ? "translateY(-2px) scale(1.05)" : "translateY(0) scale(1)",
            transition: "transform 160ms ease, box-shadow 160ms ease",
          }}
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          ) : (
            <ConqrServiceIcon size={24} />
          )}
        </button>
      </div>

      <style>{`
        @keyframes cqr-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cqr-spin { to { transform: rotate(360deg) } }
        @keyframes cqr-pop {
          from { opacity: 0; transform: translateY(8px) scale(.96) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-conqr-service-launcher] button,
          [data-conqr-service-panel] { transition: none !important; animation: none !important }
        }
        @media (max-width: 640px) {
          [data-conqr-service-panel] {
            right: 8px !important; left: 8px !important;
            width: auto !important;
            bottom: 8px !important;
            height: min(78vh, 560px) !important;
          }
        }
      `}</style>
    </>,
    document.body,
  );
}
