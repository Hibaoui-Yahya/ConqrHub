import {
  IconLink,
  IconFileText,
  IconChecklist,
  IconTargetArrow,
  IconAlertTriangle,
  IconLock,
  IconTrash,
  IconPlugConnectedX,
  IconSquarePlus,
  IconArrowRight,
  type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

/**
 * @conqr/icons — one semantic icon vocabulary (blueprint §7.1). Components map
 * meaning → glyph so ConqrHub and the Plane fork use the same icon for the same
 * concept. Directional glyphs flip under RTL via `dir`-aware CSS at the app
 * root; `AccessibleIcon` enforces a label (or explicit decorative marking).
 */
export const ConqrIcon = {
  relation: IconLink,
  document: IconFileText,
  requirement: IconChecklist,
  workItem: IconTargetArrow,
  warning: IconAlertTriangle,
  restricted: IconLock,
  deleted: IconTrash,
  integrationOff: IconPlugConnectedX,
  create: IconSquarePlus,
  next: IconArrowRight,
} satisfies Record<string, ComponentType<IconProps>>;

export type ConqrIconName = keyof typeof ConqrIcon;

/** Directional icons that must mirror in right-to-left locales. */
export const RTL_MIRRORED: ReadonlySet<ConqrIconName> = new Set(["next"]);

export function AccessibleIcon({
  name,
  label,
  decorative,
  size = 16,
  ...rest
}: {
  name: ConqrIconName;
  /** Required unless `decorative`; becomes aria-label. */
  label?: string;
  decorative?: boolean;
  size?: number;
} & IconProps) {
  const Glyph = ConqrIcon[name];
  const a11y = decorative
    ? { "aria-hidden": true }
    : { role: "img", "aria-label": label ?? name };
  const rtl = RTL_MIRRORED.has(name)
    ? { style: { ...(rest.style ?? {}) } }
    : {};
  return <Glyph size={size} {...a11y} {...rest} {...rtl} />;
}

export { IconProps };
