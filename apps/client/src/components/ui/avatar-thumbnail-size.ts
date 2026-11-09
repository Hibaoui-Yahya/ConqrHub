/**
 * Server thumbnail edge (64/128/256 px) for an avatar shown at a Mantine
 * size on a 2x screen — menus never download the original photo (LTC-06).
 */
const MANTINE_AVATAR_PX: Record<string, number> = {
  xs: 16,
  sm: 26,
  md: 38,
  lg: 56,
  xl: 84,
};

export function avatarThumbnailSize(size?: string | number): 64 | 128 | 256 {
  const px =
    typeof size === "number"
      ? size
      : (MANTINE_AVATAR_PX[size ?? "md"] ?? (parseInt(String(size), 10) || 38));
  if (px * 2 <= 64) return 64;
  if (px * 2 <= 128) return 128;
  return 256;
}
