import {
  deploymentTimeZone,
  formatMeetingDate,
  formatMeetingDateTime,
  isValidTimeZone,
  normalizeLanguage,
  reportLabels,
  reportLanguageInstruction,
  resolveReportLanguage,
  resolveTimeZone,
} from './meeting-locale.util';

describe('report language (LTC-05)', () => {
  it('takes the meeting language first, then the detected one, then the defaults', () => {
    expect(resolveReportLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(resolveReportLanguage([undefined, 'auto', 'en', 'fr'])).toBe('en');
    expect(resolveReportLanguage([null, '', 'fr_FR'])).toBe('fr');
    expect(resolveReportLanguage([undefined, null])).toBe('fr');
    expect(resolveReportLanguage(['xx-not-a-language'], 'en')).toBe('en');
  });

  it('normalizes locale forms and refuses junk', () => {
    expect(normalizeLanguage('EN-us')).toBe('en');
    expect(normalizeLanguage('auto')).toBeNull();
    expect(normalizeLanguage(42)).toBeNull();
  });

  it('asks for French headings and overview without translating quotes', () => {
    const fr = reportLanguageInstruction('fr');
    expect(fr).toContain('en français');
    expect(fr).toContain('vue d’ensemble');
    expect(fr).toContain('Les citations restent dans la langue');
    expect(reportLanguageInstruction('en')).toContain('in English');
    expect(reportLanguageInstruction('es')).toContain('Spanish');
    expect(reportLabels('fr').keyPoints).toBe('Points clés');
    expect(reportLabels('en').keyPoints).toBe('Key points');
  });
});

describe('time zones (LTC-05)', () => {
  const savedEnv = process.env.DEFAULT_TIMEZONE;
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.DEFAULT_TIMEZONE;
    else process.env.DEFAULT_TIMEZONE = savedEnv;
  });

  it('uses the first valid zone and falls back for missing or invalid ones', () => {
    delete process.env.DEFAULT_TIMEZONE;
    expect(resolveTimeZone(['Europe/Paris', 'America/Toronto'])).toBe('Europe/Paris');
    expect(resolveTimeZone([null, '', 'Not/AZone', 'America/Vancouver'])).toBe('America/Vancouver');
    // No tenant inherits Quebec time: an unconfigured company gets UTC.
    expect(resolveTimeZone([undefined, 'invalid timezone'])).toBe('UTC');
    expect(resolveTimeZone([], 'Europe/Paris')).toBe('Europe/Paris');
    expect(isValidTimeZone('America/Toronto')).toBe(true);
    expect(isValidTimeZone('America/Atlantis')).toBe(false);
  });

  it('lets the operator choose the deployment fallback, ignoring invalid values', () => {
    expect(deploymentTimeZone({})).toBe('UTC');
    expect(deploymentTimeZone({ DEFAULT_TIMEZONE: 'America/Toronto' })).toBe('America/Toronto');
    expect(deploymentTimeZone({ DEFAULT_TIMEZONE: 'Mars/Olympus' })).toBe('UTC');
    process.env.DEFAULT_TIMEZONE = 'Europe/Paris';
    expect(resolveTimeZone([null])).toBe('Europe/Paris');
  });

  it('shows one instant consistently, naming the zone (the 15:05 / 11:05 audit case)', () => {
    delete process.env.DEFAULT_TIMEZONE;
    const instant = '2026-10-13T15:05:00Z';
    // LTC: the company zone (America/Toronto) comes from its settings.
    expect(formatMeetingDateTime(instant, 'America/Toronto')).toBe('13 octobre 2026 à 11 h 05 HAE');
    expect(formatMeetingDateTime(instant, 'UTC')).toBe('13 octobre 2026 à 15 h 05 UTC');
    // An invalid zone never throws; the labelled fallback is UTC.
    expect(formatMeetingDateTime(instant, 'Bad/Zone')).toBe('13 octobre 2026 à 15 h 05 UTC');
  });

  it('crosses the daylight-saving boundaries of Toronto correctly', () => {
    // Spring forward: 2026-03-08 02:00 EST → 03:00 EDT.
    expect(formatMeetingDateTime('2026-03-08T06:59:00Z', 'America/Toronto')).toBe('8 mars 2026 à 01 h 59 HNE');
    expect(formatMeetingDateTime('2026-03-08T07:01:00Z', 'America/Toronto')).toBe('8 mars 2026 à 03 h 01 HAE');
    // Fall back: 2026-11-01 02:00 EDT → 01:00 EST (01:30 happens twice).
    expect(formatMeetingDateTime('2026-11-01T05:30:00Z', 'America/Toronto')).toBe('1 novembre 2026 à 01 h 30 HAE');
    expect(formatMeetingDateTime('2026-11-01T06:30:00Z', 'America/Toronto')).toBe('1 novembre 2026 à 01 h 30 HNE');
  });

  it('dates a late-evening meeting on the local day, not the UTC day', () => {
    // 23:30 in Toronto on 13 Oct is already 14 Oct in UTC.
    expect(formatMeetingDate('2026-10-14T03:30:00Z', 'America/Toronto')).toBe('13 octobre 2026');
    expect(formatMeetingDate('2026-10-14T03:30:00Z', 'UTC')).toBe('14 octobre 2026');
    expect(formatMeetingDate(null, 'UTC')).toBeNull();
    expect(formatMeetingDate('not a date', 'UTC')).toBeNull();
  });
});
