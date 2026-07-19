/**
 * @conqr/tokens — programmatic access to the Conqr design tokens.
 *
 * The visual source of truth is `tokens.css` (import it once at app root:
 * `import "@conqr/tokens/tokens.css"`). This module exposes the semantic token
 * NAMES so integration UI (smart cards, preview panels) can reference tokens in
 * a typed, refactor-safe way instead of hand-writing `var(--…)` strings.
 */

export const SEMANTIC_TOKENS = {
  bg: {
    canvas: '--bg-canvas',
    surface1: '--bg-surface-1',
    surface2: '--bg-surface-2',
    accentPrimary: '--bg-accent-primary',
    accentSubtle: '--bg-accent-subtle',
    dangerSubtle: '--bg-danger-subtle',
  },
  text: {
    primary: '--txt-primary',
    secondary: '--txt-secondary',
    tertiary: '--txt-tertiary',
    accentPrimary: '--txt-accent-primary',
    onColor: '--txt-on-color',
  },
  border: {
    subtle: '--border-subtle',
    strong: '--border-strong',
    accentStrong: '--border-accent-strong',
  },
  brand: {
    default: '--brand-default',
  },
} as const;

/** `token('--brand-default')` → `var(--brand-default)`. */
export function token(name: string): string {
  return `var(${name})`;
}

export const CONQR_TOKENS_CSS = '@conqr/tokens/tokens.css';
