import {
  PROVIDER_ACCEPTS_LANGUAGE_WITH_DIARIZATION,
  reportLanguageCandidate,
  sttLanguage,
} from './meeting-stt-language.util';

describe('sttLanguage', () => {
  it('turns a single language into an ISO hint, whatever its spelling', () => {
    for (const language of ['fr', 'FR', 'fr-CA', 'fr_FR']) {
      expect(sttLanguage({ language })).toMatchObject({ requested: 'fr', hint: 'fr', mode: 'single' });
    }
    expect(sttLanguage({ language: 'ar' })).toMatchObject({ hint: 'ar', mode: 'single' });
  });

  it('auto-detects Arabic + English code-switching instead of forcing one language', () => {
    expect(sttLanguage({ language: 'ar_en' })).toEqual({
      requested: 'ar_en',
      hint: null,
      mode: 'code_switching',
      sentToProvider: false,
    });
    expect(sttLanguage({ language: 'ar-en' }).mode).toBe('code_switching');
  });

  it('auto-detects without a usable choice', () => {
    for (const config of [undefined, null, {}, { language: '' }, { language: 'auto' }, { language: 'klingon' }, { language: 42 }]) {
      expect(sttLanguage(config)).toMatchObject({ requested: null, hint: null, mode: 'auto' });
    }
  });

  it('never sends a hint the diarized provider request would reject', () => {
    expect(PROVIDER_ACCEPTS_LANGUAGE_WITH_DIARIZATION).toBe(false);
    expect(sttLanguage({ language: 'fr' }).sentToProvider).toBe(false);
  });

  it('gives reports a language only for a single-language meeting', () => {
    expect(reportLanguageCandidate({ language: 'en-GB' })).toBe('en');
    expect(reportLanguageCandidate({ language: 'ar_en' })).toBeNull();
    expect(reportLanguageCandidate({})).toBeNull();
  });
});
