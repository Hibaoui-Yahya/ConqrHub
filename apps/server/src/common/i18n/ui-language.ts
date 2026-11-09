import { defaultUserLocale } from '@docmost/db/repos/user/default-locale';

/**
 * Language of everything the server writes for a person (e-mails, refusal
 * messages): French for any `fr*` account locale, English otherwise. The
 * interface follows `users.locale` the same way.
 */
export type UiLanguage = 'fr' | 'en';

/** "fr-FR" / "fr_CA" / "FR" → "fr"; any other usable tag → "en"; else null. */
export function uiLanguageOf(locale: unknown): UiLanguage | null {
  if (typeof locale !== 'string') return null;
  const value = locale.trim();
  if (!/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})*$/.test(value)) return null;
  return value.slice(0, 2).toLowerCase() === 'fr' ? 'fr' : 'en';
}

/**
 * First usable locale among the candidates, most specific first (the
 * recipient's, then e.g. the inviter's). Without any: the deployment's
 * DEFAULT_USER_LOCALE, which itself falls back to en-US.
 */
export function resolveUiLanguage(...candidates: unknown[]): UiLanguage {
  for (const candidate of candidates) {
    const lang = uiLanguageOf(candidate);
    if (lang) return lang;
  }
  return uiLanguageOf(defaultUserLocale()) ?? 'en';
}

/** Picks the text of a `{ fr, en }` pair. */
export function pick<T>(text: { fr: T; en: T }, lang: UiLanguage): T {
  return lang === 'fr' ? text.fr : text.en;
}
