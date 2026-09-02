import {
  getRelativeLuminance,
  hexToOKLCH,
  oklchToCSS,
} from "./color-conversion";
import type { OKLCH } from "./color-conversion";
import { normalizeHexColor } from "./color-validation";

/**
 * Custom-theme application for ConqrHub.
 *
 * Same model as ConqrPlan's `applyCustomTheme` (two colors + light/dark
 * palette) and the same output (inline `--neutral-*` / `--brand-*` variables
 * on <html> that every semantic token in packages/tokens/tokens.css resolves
 * through). The ramp math differs on purpose: Plane regenerates lightness from
 * a fixed stop table, which does not match this token sheet's lightness and
 * turns surfaces gray. Here each stop keeps the lightness the token sheet
 * ships with and only borrows hue and chroma from the chosen colors, so the
 * primary lands exactly on `--brand-default` and the UI keeps its contrast.
 */

type Mode = "light" | "dark";

const NEUTRAL_KEYS = [
  "white",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "1000",
  "1100",
  "1200",
  "black",
] as const;

const BRAND_KEYS = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "1000",
  "1100",
  "1200",
] as const;

/* Lightness per stop, lifted from packages/tokens/tokens.css. */
const NEUTRAL_L: Record<Mode, Record<(typeof NEUTRAL_KEYS)[number], number>> = {
  light: {
    white: 1,
    "100": 0.9848,
    "200": 0.9696,
    "300": 0.9543,
    "400": 0.9389,
    "500": 0.9235,
    "600": 0.8925,
    "700": 0.8612,
    "800": 0.6668,
    "900": 0.6161,
    "1000": 0.5288,
    "1100": 0.4377,
    "1200": 0.2378,
    black: 0.1472,
  },
  dark: {
    black: 0.1689,
    "100": 0.1932,
    "200": 0.2158,
    "300": 0.2378,
    "400": 0.2593,
    "500": 0.3011,
    "600": 0.3415,
    "700": 0.3999,
    "800": 0.5989,
    "900": 0.6835,
    "1000": 0.7655,
    "1100": 0.8455,
    "1200": 0.9235,
    white: 0.9702,
  },
};

const BRAND_L: Record<Mode, Record<(typeof BRAND_KEYS)[number], number>> = {
  light: {
    "100": 0.9847,
    "200": 0.9715,
    "300": 0.9428,
    "400": 0.9008,
    "500": 0.8414,
    "600": 0.7649,
    "700": 0.6766,
    "800": 0.555,
    "900": 0.4347,
    "1000": 0.3399,
    "1100": 0.2626,
    "1200": 0.2093,
  },
  dark: {
    "100": 0.2029,
    "200": 0.2513,
    "300": 0.3208,
    "400": 0.4088,
    "500": 0.4511,
    "600": 0.6,
    "700": 0.7408,
    "800": 0.82,
    "900": 0.8969,
    "1000": 0.9409,
    "1100": 0.9704,
    "1200": 0.9856,
  },
};

/* The neutral stop the page canvas resolves to (see tokens.css --bg-canvas). */
const CANVAS_KEY: Record<Mode, (typeof NEUTRAL_KEYS)[number]> = {
  light: "300",
  dark: "black",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/* Chroma falls off toward black and white so extremes stay clean. */
function chromaAt(
  l: number,
  inputC: number,
  peakL: number,
  floor: number,
): number {
  const dist = Math.abs(l - peakL) / 0.5;
  const scale = clamp(1 - Math.pow(dist, 1.6), 0, 1);
  return Math.max(inputC * scale, inputC * floor);
}

export interface HubCustomThemeVars {
  neutral: Record<string, string>;
  brand: Record<string, string>;
  brandDefault: string;
  txtOnColor: string;
}

export function buildHubCustomTheme(
  primaryHex: string,
  backgroundHex: string,
  mode: Mode,
): HubCustomThemeVars {
  const primary = hexToOKLCH(normalizeHexColor(primaryHex));
  const background = hexToOKLCH(normalizeHexColor(backgroundHex));

  // Background: tint every neutral stop with the chosen hue, and nudge the
  // whole ramp by how far the chosen lightness sits from the canvas stop
  // (capped so text/surface contrast survives).
  const canvasL = NEUTRAL_L[mode][CANVAS_KEY[mode]];
  const shift = clamp(background.l - canvasL, -0.08, 0.08);
  const neutralC = Math.min(background.c * 0.25, 0.025);
  const neutral: Record<string, string> = {};
  for (const key of NEUTRAL_KEYS) {
    const l = clamp(NEUTRAL_L[mode][key] + shift, 0, 1);
    const oklch: OKLCH = {
      l,
      c: chromaAt(l, neutralC, 0.5, 0.3),
      h: background.h,
    };
    neutral[key] = oklchToCSS(oklch);
  }

  // Primary: exact color on --brand-default; the ramp keeps the sheet's
  // lightness with the primary's hue and a lightness-weighted chroma.
  const brand: Record<string, string> = {};
  for (const key of BRAND_KEYS) {
    const l = BRAND_L[mode][key];
    const oklch: OKLCH = {
      l,
      c: chromaAt(l, primary.c, primary.l, 0.15),
      h: primary.h,
    };
    brand[key] = oklchToCSS(oklch);
  }

  const isPrimaryDark =
    getRelativeLuminance(normalizeHexColor(primaryHex)) < 0.5;

  return {
    neutral,
    brand,
    brandDefault: oklchToCSS(primary),
    txtOnColor: isPrimaryDark ? "oklch(1 0 0)" : "oklch(0.1482 0.0034 196.79)",
  };
}

export function applyHubCustomTheme(
  primaryHex: string,
  backgroundHex: string,
  mode: Mode,
): void {
  const html = document.documentElement;
  const vars = buildHubCustomTheme(primaryHex, backgroundHex, mode);
  Object.entries(vars.neutral).forEach(([k, v]) =>
    html.style.setProperty(`--neutral-${k}`, v),
  );
  Object.entries(vars.brand).forEach(([k, v]) =>
    html.style.setProperty(`--brand-${k}`, v),
  );
  html.style.setProperty("--brand-default", vars.brandDefault);
  html.style.setProperty("--txt-on-color", vars.txtOnColor);
}

export function clearHubCustomTheme(): void {
  const html = document.documentElement;
  NEUTRAL_KEYS.forEach((k) => html.style.removeProperty(`--neutral-${k}`));
  BRAND_KEYS.forEach((k) => html.style.removeProperty(`--brand-${k}`));
  html.style.removeProperty("--brand-default");
  html.style.removeProperty("--txt-on-color");
}
