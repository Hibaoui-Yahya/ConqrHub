import { getAvatarUrl } from "@/lib/config.ts";
import { AvatarIconType } from "@/features/attachments/types/attachment.types.ts";

/**
 * Plane's bundled project covers (apps/web/app/assets/cover-images), served
 * from /covers/image_N.jpg. A space's `coverImage` is either one of these
 * keys (`static:image_N`), an uploaded `space-cover` file name, or null.
 */
export const STATIC_COVER_COUNT = 29;

export const STATIC_COVER_KEYS: string[] = Array.from(
  { length: STATIC_COVER_COUNT },
  (_, i) => `static:image_${i + 1}`,
);

export function isStaticCover(ref?: string | null): boolean {
  return !!ref && ref.startsWith("static:");
}

export function staticCoverUrl(key: string): string {
  return `/covers/${key.replace(/^static:/, "")}.jpg`;
}

/* Stable per-space default so cards don't reshuffle on every render. */
export function defaultCoverKey(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return STATIC_COVER_KEYS[h % STATIC_COVER_COUNT];
}

export function getSpaceCoverUrl(space: {
  id: string;
  coverImage?: string | null;
}): string {
  const ref = space.coverImage;
  if (!ref) return staticCoverUrl(defaultCoverKey(space.id));
  if (isStaticCover(ref)) return staticCoverUrl(ref);
  return getAvatarUrl(ref, AvatarIconType.SPACE_COVER) ?? "";
}
