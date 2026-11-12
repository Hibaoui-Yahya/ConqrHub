import {
  BUILTIN_TEMPLATES,
  buildSectionsPrompt,
  buildSingleSectionPrompt,
  interpretSectionsAnswer,
  interpretSingleSectionAnswer,
  parseJsonLoose,
  salvageTruncatedJson,
} from './meeting-template.util';

/**
 * Prod 2026-11-12: a 38-minute meeting got three "unparseable" report
 * answers in a row and no report at all. These cover the answer shapes that
 * used to be thrown away whole.
 */
describe('salvaging report answers', () => {
  const spec = BUILTIN_TEMPLATES['generic-meeting'].draft;
  const sections = spec.sections.filter((s) => s.enabled);

  it('keeps the complete entries of an answer cut off inside a value', () => {
    const cut = '{"sections": {"summary": "Budget validé.", "decisions": "- Phase deux", "actions": "- [Marie] Pré';
    expect(parseJsonLoose(cut)).toEqual({ sections: { summary: 'Budget validé.', decisions: '- Phase deux' } });
    const read = interpretSectionsAnswer(parseJsonLoose(cut), sections);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.filled).toEqual(['summary', 'decisions']);
      expect(read.missing).toEqual(['actions', 'next_steps']);
    }
  });

  it('keeps an entry that is complete when the cut falls right after it', () => {
    expect(parseJsonLoose('{"sections": {"summary": "A", "decisions": "B"')).toEqual({
      sections: { summary: 'A', decisions: 'B' },
    });
  });

  it('reads an answer inside a fence that was never closed', () => {
    expect(parseJsonLoose('```json\n{"sections": {"summary": "A", "decisions": "B", "act')).toEqual({
      sections: { summary: 'A', decisions: 'B' },
    });
  });

  it('accepts raw line breaks inside the Markdown values', () => {
    const raw = '{"sections": {"summary": "- un\n- deux", "decisions": "x"}}';
    expect(parseJsonLoose(raw)).toEqual({ sections: { summary: '- un\n- deux', decisions: 'x' } });
  });

  it('does not invent content: a cut before any complete section yields nothing usable', () => {
    const read = interpretSectionsAnswer('{"sections": {"summary": "Budg', sections);
    expect(read.ok).toBe(false);
  });

  it('leaves complete and non-JSON text alone', () => {
    expect(salvageTruncatedJson('{"a": 1}')).toBeUndefined();
    expect(salvageTruncatedJson('pas de JSON')).toBeUndefined();
    expect(parseJsonLoose('pas de JSON')).toBeUndefined();
  });

  it('a retry asks only for the missing sections', () => {
    const retry = buildSectionsPrompt({ title: 'T', templateName: 'G', spec, transcript: 'x', strict: true, only: ['actions', 'next_steps'] });
    expect(retry.sections.map((s) => s.id)).toEqual(['actions', 'next_steps']);
    expect(retry.prompt).not.toContain('"summary" ·');
    // An unknown subset falls back to every enabled section.
    expect(buildSectionsPrompt({ title: 'T', templateName: 'G', spec, transcript: 'x', only: ['nope'] }).sections.length).toBe(sections.length);
  });

  it('the single-section prompt asks for plain Markdown', () => {
    const p = buildSingleSectionPrompt({ title: 'T', templateName: 'G', spec, section: sections[0], transcript: 'Marie: bonjour', language: 'fr' });
    expect(p.system).toContain('pas de JSON');
    expect(p.prompt).toContain(sections[0].title);
    expect(p.prompt).toContain('Marie: bonjour');
  });

  it('reads a single-section answer', () => {
    expect(interpretSingleSectionAnswer('- Phase deux')).toEqual({ empty: false, markdown: '- Phase deux' });
    expect(interpretSingleSectionAnswer('```markdown\n- A\n```')).toEqual({ empty: false, markdown: '- A' });
    expect(interpretSingleSectionAnswer('_Rien de consigné._')).toEqual({ empty: true, markdown: '' });
    expect(interpretSingleSectionAnswer('{"sections": {}}')).toBeNull();
    expect(interpretSingleSectionAnswer('   ')).toBeNull();
  });
});
