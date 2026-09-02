import { atomWithStorage } from "jotai/utils";
import type { MantineColorScheme } from "@mantine/core";

/**
 * ConqrPlan's theme model (packages/constants/src/themes.ts) for ConqrHub.
 *
 * The Mantine color scheme (light | dark | auto, shared with ConqrPlan via
 * the `conqr-theme` cookie) stays the source of truth for light vs dark.
 * This preference layers on top of it: which of the six Plane themes the
 * user picked, plus the custom palette when `theme === "custom"`.
 */
export type ConqrThemeKey =
  | "system"
  | "light"
  | "dark"
  | "light-contrast"
  | "dark-contrast"
  | "custom";

export interface ConqrCustomTheme {
  /* hex, e.g. #3f76ff */
  primary: string;
  /* hex, e.g. #1a1a1a */
  background: string;
  darkPalette: boolean;
}

export interface ConqrThemePreference {
  theme: ConqrThemeKey;
  custom?: ConqrCustomTheme;
}

export interface ConqrThemeOption {
  value: ConqrThemeKey;
  label: string;
  /* Plane's two-half swatch icon */
  icon: { border: string; color1: string; color2: string };
}

/* Same swatch colors as Plane's THEME_OPTIONS. */
export const CONQR_THEME_OPTIONS: ConqrThemeOption[] = [
  {
    value: "system",
    label: "System preference",
    icon: { border: "#DEE2E6", color1: "#FAFAFA", color2: "#3F76FF" },
  },
  {
    value: "light",
    label: "Light",
    icon: { border: "#DEE2E6", color1: "#FAFAFA", color2: "#3F76FF" },
  },
  {
    value: "dark",
    label: "Dark",
    icon: { border: "#2E3234", color1: "#191B1B", color2: "#3C85D9" },
  },
  {
    value: "light-contrast",
    label: "Light high contrast",
    icon: { border: "#000000", color1: "#FFFFFF", color2: "#3F76FF" },
  },
  {
    value: "dark-contrast",
    label: "Dark high contrast",
    icon: { border: "#FFFFFF", color1: "#030303", color2: "#3A8BE9" },
  },
  {
    value: "custom",
    label: "Custom theme",
    icon: { border: "#FFC9C9", color1: "#FFF7F7", color2: "#FF5151" },
  },
];

export const DEFAULT_CUSTOM_THEME: ConqrCustomTheme = {
  primary: "#3f76ff",
  background: "#1a1a1a",
  darkPalette: false,
};

export const conqrThemeAtom = atomWithStorage<ConqrThemePreference>(
  "conqr-theme-pref",
  { theme: "system" },
);

/* Which Mantine scheme a Plane theme resolves to. */
export function schemeForTheme(pref: ConqrThemePreference): MantineColorScheme {
  switch (pref.theme) {
    case "system":
      return "auto";
    case "light":
    case "light-contrast":
      return "light";
    case "dark":
    case "dark-contrast":
      return "dark";
    case "custom":
      return pref.custom?.darkPalette ? "dark" : "light";
  }
}

/* Reverse mapping used when the quick sun/moon toggle flips the scheme. */
export function themeForScheme(scheme: "light" | "dark"): ConqrThemeKey {
  return scheme;
}
