/**
 * Theme utilities for ConqrHub's custom theme.
 *
 * color-conversion.ts and color-validation.ts are ported verbatim from
 * ConqrPlan (packages/utils/src/theme, AGPL-3.0). hub-theme.ts builds the
 * neutral/brand ramps against this repo's token sheet.
 */
export {
  hexToOKLCH,
  oklchToCSS,
  getRelativeLuminance,
  type OKLCH,
} from "./color-conversion";
export { normalizeHexColor, validateHexColor } from "./color-validation";
export {
  applyHubCustomTheme,
  clearHubCustomTheme,
  buildHubCustomTheme,
  type HubCustomThemeVars,
} from "./hub-theme";
