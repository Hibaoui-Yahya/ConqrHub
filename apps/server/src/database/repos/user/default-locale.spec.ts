import { defaultUserLocale } from './default-locale';

describe('defaultUserLocale', () => {
  it('uses the configured language-REGION tag', () => {
    expect(defaultUserLocale('fr-FR')).toBe('fr-FR');
    expect(defaultUserLocale('  fr-FR ')).toBe('fr-FR');
  });

  it('falls back to en-US when unset or malformed', () => {
    expect(defaultUserLocale(undefined)).toBe('en-US');
    expect(defaultUserLocale('')).toBe('en-US');
    expect(defaultUserLocale('fr')).toBe('en-US');
    expect(defaultUserLocale('french')).toBe('en-US');
    expect(defaultUserLocale("fr-FR'; drop")).toBe('en-US');
  });
});
