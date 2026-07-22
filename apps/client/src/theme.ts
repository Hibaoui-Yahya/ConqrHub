import {
  Card,
  createTheme,
  CSSVariablesResolver,
  MantineColorsTuple,
  Menu,
  Modal,
  Paper,
  Popover,
  Tabs,
  Tooltip,
} from "@mantine/core";

/**
 * Conqr theme — bridges Mantine v8 onto Plane's design tokens (see
 * ./styles/conqr-tokens.css). Mantine's core CSS variables are remapped to the
 * ported Plane tokens so the whole existing app adopts Plane's palette,
 * typography and radius without touching individual components.
 *
 * Two mapping styles are used deliberately:
 *  - ACCENT tuples (brand/red/green/…) reference scheme-switching `var(--…)`
 *    tokens, because accents behave identically in light and dark.
 *  - NEUTRAL tuples (gray/dark) use fixed literals per Mantine convention:
 *    `gray` is the light-scheme neutral ramp, `dark` the dark-scheme ramp, so
 *    Mantine (and existing `light-dark(gray, dark)` rules) pick the right one.
 */

// Brand ramp → Plane --brand-* (scheme-switching). Index 6 = brand-default.
const brand: MantineColorsTuple = [
  "var(--brand-100)",
  "var(--brand-200)",
  "var(--brand-300)",
  "var(--brand-400)",
  "var(--brand-500)",
  "var(--brand-600)",
  "var(--brand-default)",
  "var(--brand-900)",
  "var(--brand-1000)",
  "var(--brand-1100)",
];

const red: MantineColorsTuple = [
  "var(--red-100)",
  "var(--red-200)",
  "var(--red-300)",
  "var(--red-400)",
  "var(--red-500)",
  "var(--red-600)",
  "var(--red-700)",
  "var(--red-800)",
  "var(--red-900)",
  "var(--red-1000)",
];

const green: MantineColorsTuple = [
  "var(--green-100)",
  "var(--green-200)",
  "var(--green-300)",
  "var(--green-400)",
  "var(--green-500)",
  "var(--green-600)",
  "var(--green-700)",
  "var(--green-800)",
  "var(--green-900)",
  "var(--green-1000)",
];

// Light-scheme neutral ramp (literals, 0 = lightest → 9 = darkest).
const gray: MantineColorsTuple = [
  "oklch(0.9848 0.0003 230.66)", // neutral-100
  "oklch(0.9696 0.0007 230.67)", // neutral-200
  "oklch(0.9543 0.001 230.67)", // neutral-300
  "oklch(0.9389 0.0014 230.68)", // neutral-400
  "oklch(0.8925 0.0024 230.7)", // neutral-600
  "oklch(0.8612 0.0032 230.71)", // neutral-700
  "oklch(0.6161 0.009153 230.867)", // neutral-900
  "oklch(0.5288 0.0083 230.88)", // neutral-1000
  "oklch(0.4377 0.0066 230.87)", // neutral-1100
  "oklch(0.2378 0.0029 230.83)", // neutral-1200
];

// Dark-scheme neutral ramp (literals, 0 = lightest text → 9 = darkest bg).
// dark[7] is Mantine's body background; dark[6] elevated; dark[4/5] borders.
const dark: MantineColorsTuple = [
  "oklch(0.9235 0.001733 230.6853)", // neutral-1200 (brightest text)
  "oklch(0.8455 0.0035 230.72)", // neutral-1100
  "oklch(0.7655 0.0054 230.76)", // neutral-1000
  "oklch(0.6835 0.0074 230.81)", // neutral-900
  "oklch(0.3415 0.0049 230.86)", // neutral-600 (border strong)
  "oklch(0.3011 0.0041 230.85)", // neutral-500 (border)
  "oklch(0.2158 0.0025 230.82)", // neutral-200 (elevated / hover)
  "oklch(0.1932 0.002 230.81)", // neutral-100 (surface / body)
  "oklch(0.1689 0.0021 230.81)", // neutral-black
  "oklch(0.1472 0.0034 230.83)", // deepest
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 6,
  autoContrast: false,
  fontFamily:
    '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  headings: {
    fontFamily:
      '"Inter Variable", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  // 4px default = Plane's dominant `rounded-sm` (Tailwind v4). Keeps buttons,
  // inputs, list items, badges at the same tightness as Plane's chrome.
  defaultRadius: "sm",
  // Radius scale mapped 1:1 onto Plane's Tailwind v4 scale (its `variables.css`
  // only overrides `--radius-4xl`, so the v4 defaults apply): xs=2 sm=4 md=6
  // lg=8 xl=12. Previously shifted +2px at the low end, which made ConqrHub's
  // corners visibly rounder than Plane — now they match exactly.
  radius: {
    xs: "2px", // rounded-xs
    sm: "4px", // rounded-sm — dominant control radius
    md: "6px", // rounded-md
    lg: "8px", // rounded-lg — cards, search, panels
    xl: "12px", // rounded-xl — modals
  },
  colors: {
    brand,
    // keep `blue` aliased to brand so existing color="blue" usages align
    blue: brand,
    red,
    green,
    gray,
    dark,
  },
  components: {
    Tabs: Tabs.extend({
      vars: (theme, props) => ({
        root: {
          ...(props.color === "dark" && {
            "--tabs-color": "var(--mantine-color-dark-default)",
          }),
        },
      }),
    }),
    // Surface radii matched to Plane: cards/panels = rounded-lg (8px), modals =
    // rounded-xl (12px), dropdown menus/popovers = rounded-md (6px), tooltips =
    // rounded-sm (4px).
    Modal: Modal.extend({ defaultProps: { radius: "lg" } }),
    Card: Card.extend({
      defaultProps: { radius: "lg" },
      styles: {
        root: {
          background: "var(--bg-surface-1)",
          borderColor: "var(--border-subtle)",
          borderWidth: "0.5px",
        },
      },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "lg" },
      styles: { root: { borderColor: "var(--border-subtle)", borderWidth: "0.5px" } },
    }),
    Menu: Menu.extend({ defaultProps: { radius: "md", shadow: "md" } }),
    Popover: Popover.extend({ defaultProps: { radius: "md", shadow: "md" } }),
    Tooltip: Tooltip.extend({ defaultProps: { radius: "md" } }),
  },
});

export const mantineCssResolver: CSSVariablesResolver = (theme) => ({
  variables: {
    "--input-error-size": theme.fontSizes.sm,
    // Core surfaces/text/border driven by Plane semantic tokens (scheme-switching).
    "--mantine-color-body": "var(--bg-surface-1)",
    "--mantine-color-text": "var(--txt-primary)",
    "--mantine-color-dimmed": "var(--txt-tertiary)",
    "--mantine-color-default-border": "var(--border-subtle)",
    "--mantine-color-anchor": "var(--txt-link-primary)",
  },
  light: {
    // Foreground for `subtle`/`light` dark-variant controls — was a hardcoded
    // mid-gray (#4e5359); use the matching Plane semantic text token instead.
    "--mantine-color-dark-light-color": "var(--txt-secondary)",
    "--mantine-color-dark-light-hover": "var(--mantine-color-gray-light-hover)",
    // Text colour for `subtle`/`light` brand variants (e.g. the "View all spaces"
    // button). On white, the default brand shade reads fine.
    "--mantine-color-brand-light-color": "var(--brand-default)",
    "--mantine-color-blue-light-color": "var(--brand-default)",
  },
  dark: {
    "--mantine-color-dark-light-color": "var(--mantine-color-gray-4)",
    "--mantine-color-dark-light-hover": "var(--mantine-color-default-hover)",
    // Mantine's auto-derived brand `light-color` is a dark shade in dark mode, so
    // `subtle`/`light` brand text (links, the "View all spaces" button, tab
    // accents…) rendered near-invisible on the dark surface. Pin it to the bright
    // brand shade used by link-hover so the whole class of accent text is legible.
    "--mantine-color-brand-light-color": "var(--brand-700)",
    "--mantine-color-blue-light-color": "var(--brand-700)",
  },
});
