import { MAX_INSIGHT_CONTENT_CHARS, normalizeInsight } from './meeting-insights.util';

describe('normalizeInsight', () => {
  it('keeps a Q&A with its question and an analysis without one', () => {
    expect(normalizeInsight({ kind: 'qa', question: ' Qui ? ', content: ' Marie. ', transcriptVersion: 2 })).toEqual({
      ok: true,
      kind: 'qa',
      question: 'Qui ?',
      content: 'Marie.',
      transcriptVersion: 2,
    });
    expect(
      normalizeInsight({ kind: 'communication-analysis', question: 'ignored', content: '## Analyse' }),
    ).toEqual({ ok: true, kind: 'communication-analysis', question: null, content: '## Analyse', transcriptVersion: null });
  });

  it('refuses in French: unknown kind, empty content, a Q&A without question, oversize text', () => {
    expect(normalizeInsight({ kind: 'summary', content: 'x' })).toMatchObject({ ok: false });
    expect(normalizeInsight({ kind: 'qa', question: 'Q', content: '   ' })).toEqual({
      ok: false,
      error: 'Le contenu à enregistrer est vide.',
    });
    expect(normalizeInsight({ kind: 'qa', content: 'R' })).toEqual({
      ok: false,
      error: 'La question est obligatoire pour enregistrer une réponse.',
    });
    expect(
      normalizeInsight({ kind: 'communication-analysis', content: 'x'.repeat(MAX_INSIGHT_CONTENT_CHARS + 1) }),
    ).toMatchObject({ ok: false });
  });
});
