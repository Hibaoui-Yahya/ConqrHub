/**
 * Interface language given to new accounts. Defaults to en-US; a deployment
 * can set DEFAULT_USER_LOCALE (e.g. fr-FR for a French-speaking client).
 * Anything that is not a language-REGION tag falls back to en-US.
 */
export const FALLBACK_USER_LOCALE = 'en-US';

export function defaultUserLocale(
  raw: string | undefined = process.env.DEFAULT_USER_LOCALE,
): string {
  const value = raw?.trim();
  return value && /^[a-z]{2}-[A-Z]{2}$/.test(value)
    ? value
    : FALLBACK_USER_LOCALE;
}
