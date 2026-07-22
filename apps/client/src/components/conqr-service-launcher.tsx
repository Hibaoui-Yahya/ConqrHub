"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Intent = "help" | "bug" | "suggestion";
const ACTIONS: Array<{ id: Intent; label: string; color: string; icon: string }> = [
  { id: "help", label: "Get help", color: "#111827", icon: "?" },
  { id: "bug", label: "Report a problem", color: "#ff8a00", icon: "!" },
  { id: "suggestion", label: "Share an idea", color: "#7c4dff", icon: "\u25cb" },
];

const circle = (background: string): React.CSSProperties => ({
  width: 44,
  height: 44,
  display: "grid",
  placeItems: "center",
  border: 0,
  borderRadius: "50%",
  background,
  color: "#fff",
  boxShadow: "0 5px 14px rgba(15, 23, 42, .2)",
  font: "600 17px/1 Inter, system-ui, sans-serif",
  cursor: "pointer",
  transition: "transform 150ms ease, box-shadow 150ms ease",
});

export function ConqrServiceLauncher({ productId }: { productId: string }) {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [intent, setIntent] = useState<Intent | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (document.querySelector('[data-conqr-service-runtime]')) return;
    setMounted(true);
  }, []);
  const close = () => {
    setIntent(null);
    setExpanded(false);
    window.setTimeout(() => buttonRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (intent || expanded)) close();
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setExpanded(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, intent]);

  if (!mounted) return null;
  const hostTheme = document.documentElement.classList.contains("dark") || document.documentElement.dataset.mantineColorScheme === "dark" || /(?:^|;\s*)conqr-theme=dark(?:;|$)/.test(document.cookie) || window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const launcherUrl = intent
    ? `http://localhost:5175/launcher?intent=${intent}&product=${encodeURIComponent(productId)}&theme=${hostTheme}&route=${encodeURIComponent(window.location.pathname + window.location.search)}&locale=${encodeURIComponent(navigator.language)}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`
    : "";

  return createPortal(
    <>
      {intent && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, fontFamily: "Inter, system-ui, sans-serif" }}>
          <button aria-label="Close ConqrService" onClick={close} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", padding: 0, border: 0, background: "rgba(15, 23, 42, .30)", cursor: "default" }} />
          <section role="dialog" aria-modal="true" aria-label="ConqrService" style={{ position: "absolute", top: "50%", left: "50%", width: "min(420px, calc(100vw - 24px))", height: "min(520px, calc(100vh - 24px))", transform: "translate(-50%, -50%)", overflow: "hidden", border: "1px solid var(--border-subtle, var(--mantine-color-default-border, #e2e8f0))", borderRadius: 16, background: "var(--bg-surface-1, var(--mantine-color-body, #fff))", boxShadow: "0 24px 70px rgba(15, 23, 42, .24)" }}>
            <button aria-label="Close ConqrService" onClick={close} style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 34, height: 34, border: 0, borderRadius: 8, background: "transparent", color: "#94a3b8", fontSize: 20, cursor: "pointer" }}>{"\u00d7"}</button>
            <iframe title="ConqrService request" src={launcherUrl} style={{ display: "block", width: "100%", height: "100%", border: 0, background: "var(--bg-surface-1, var(--mantine-color-body, #fff))" }} />
          </section>
        </div>
      )}

      {!intent && (
        <div data-conqr-service-launcher style={{ position: "fixed", right: "max(28px, env(safe-area-inset-right))", bottom: "max(28px, env(safe-area-inset-bottom))", zIndex: 2147483000, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          {expanded && ACTIONS.map((action) => (
            <button key={action.id} aria-label={action.label} title={action.label} onClick={() => setIntent(action.id)} style={{ ...circle(action.color), pointerEvents: "auto" }} onMouseEnter={(event) => { event.currentTarget.style.transform = "translateY(-1px) scale(1.04)"; }} onMouseLeave={(event) => { event.currentTarget.style.transform = "none"; }}>
              {action.icon}
            </button>
          ))}
          <button ref={buttonRef} aria-label={expanded ? "Close ConqrService" : "Open ConqrService"} aria-expanded={expanded} title="ConqrService (Alt+S)" onClick={() => setExpanded((value) => !value)} style={{ ...circle(expanded ? "#111827" : "#006387"), pointerEvents: "auto", marginTop: expanded ? 2 : 0, fontSize: expanded ? 18 : 25, boxShadow: expanded ? "0 5px 14px rgba(15, 23, 42, .2)" : "0 8px 22px rgba(0, 99, 135, .42), 0 0 0 3px rgba(255,255,255,.88)" }}>
            {expanded ? "\u00d7" : "+"}
          </button>
        </div>
      )}
    </>,
    document.body,
  );
}
