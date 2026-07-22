"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Universal ConqrService launcher trigger embedded in ConqrHub.
 *
 * Collapsed: a floating dark circular `+` (bottom-right). Clicking it opens the
 * ConqrService `/launcher` panel, which shows the full intent list (Need help /
 * Make a request / Report a problem / Share an idea) and drives the whole Case
 * flow itself. The host only positions the trigger and frames the panel — no
 * Case rules live here.
 */

// Configured ConqrService origin (vite define); localhost is the dev fallback.
const SERVICE_URL: string =
  (typeof process !== "undefined" &&
    (process.env as Record<string, string | undefined>)?.SERVICE_APP_URL) ||
  "http://localhost:5175";

function hostIsDark(): boolean {
  const el = document.documentElement;
  return (
    el.classList.contains("dark") ||
    el.dataset.mantineColorScheme === "dark" ||
    /(?:^|;\s*)conqr-theme=dark(?:;|$)/.test(document.cookie) ||
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ConqrServiceLauncher({ productId }: { productId: string }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Never double-mount alongside the standalone embed runtime.
    if (document.querySelector("[data-conqr-service-runtime]")) return;
    setMounted(true);
  }, []);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => buttonRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) close();
      // Alt+S opens the launcher from anywhere.
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!mounted) return null;

  const theme = hostIsDark() ? "dark" : "light";
  const panelUrl =
    `${SERVICE_URL.replace(/\/+$/, "")}/launcher` +
    `?product=${encodeURIComponent(productId)}` +
    `&theme=${theme}` +
    `&route=${encodeURIComponent(window.location.pathname + window.location.search)}` +
    `&locale=${encodeURIComponent(navigator.language)}` +
    `&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`;

  const dark = theme === "dark";
  const surface = dark ? "#1a1b1e" : "#ffffff";
  const border = dark ? "rgba(255,255,255,.10)" : "rgba(15,23,42,.10)";

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
          {/* Backdrop */}
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
              background: dark ? "rgba(0,0,0,.55)" : "rgba(15,23,42,.32)",
              backdropFilter: "blur(2px)",
              cursor: "default",
              animation: "cqr-fade 140ms ease",
            }}
          />
          {/* Panel — anchored bottom-right above the trigger, like a launcher.
              Falls back to a comfortable size on small screens. */}
          <section
            role="dialog"
            aria-modal="true"
            aria-label="ConqrService"
            style={{
              position: "absolute",
              right: "max(24px, env(safe-area-inset-right))",
              bottom: "calc(84px + env(safe-area-inset-bottom))",
              width: "min(400px, calc(100vw - 32px))",
              height: "min(560px, calc(100vh - 120px))",
              overflow: "hidden",
              border: `1px solid ${border}`,
              borderRadius: 18,
              background: surface,
              boxShadow: dark
                ? "0 24px 70px rgba(0,0,0,.55)"
                : "0 24px 70px rgba(15,23,42,.24)",
              transformOrigin: "bottom right",
              animation: "cqr-pop 170ms cubic-bezier(.2,.9,.3,1.2)",
            }}
          >
            <iframe
              title="ConqrService"
              src={panelUrl}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                border: 0,
                background: surface,
              }}
            />
          </section>
        </div>
      )}

      {/* Floating dark circular trigger, bottom-right. */}
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
          aria-label={open ? "Close ConqrService" : "Open ConqrService"}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Get help or send a request (Alt+S)"
          onClick={() => setOpen((v) => !v)}
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
            fontSize: 26,
            fontWeight: 400,
            lineHeight: 1,
            cursor: "pointer",
            boxShadow: hovered
              ? "0 12px 28px rgba(15,23,42,.34)"
              : "0 8px 20px rgba(15,23,42,.26)",
            transform: hovered
              ? "translateY(-2px) scale(1.05)"
              : "translateY(0) scale(1)",
            transition: "transform 160ms ease, box-shadow 160ms ease",
          }}
        >
          <span
            style={{
              display: "inline-block",
              transition: "transform 200ms cubic-bezier(.2,.9,.3,1.2)",
              transform: open ? "rotate(45deg)" : "rotate(0deg)",
            }}
          >
            +
          </span>
        </button>
      </div>

      <style>{`
        @keyframes cqr-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cqr-pop {
          from { opacity: 0; transform: translateY(8px) scale(.96) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-conqr-service-launcher] button { transition: none !important }
        }
        @media (max-width: 640px) {
          section[aria-label="ConqrService"] {
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
