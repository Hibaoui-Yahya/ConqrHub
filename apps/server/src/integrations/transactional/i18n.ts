import {
  resolveUiLanguage,
  type UiLanguage,
} from '../../common/i18n/ui-language';

/**
 * Language of an e-mail: the RECIPIENT's account locale (French for any
 * `fr*`, English otherwise). Without a recipient account yet (an invitation
 * to a new address), the inviter's locale, then DEFAULT_USER_LOCALE, then
 * English. Pass the candidates most specific first.
 */
export type MailLanguage = UiLanguage;

export function mailLanguage(...locales: unknown[]): MailLanguage {
  return resolveUiLanguage(...locales);
}

/** A subject or template that is built once the recipient's language is known. */
export type Localized<T> = T | ((lang: MailLanguage) => T);

export function localize<T>(value: Localized<T>, lang: MailLanguage): T {
  return typeof value === 'function'
    ? (value as (lang: MailLanguage) => T)(lang)
    : value;
}
