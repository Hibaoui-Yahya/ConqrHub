import {
  BASE_TYPES,
  BUILTIN_TEMPLATES,
  buildSectionsPrompt,
  builtinTemplate,
  legacyOutputsFromSections,
  normalizeTemplateSpec,
  parseSectionsAnswer,
  sectionsToMarkdown,
} from './meeting-template.util';

describe('built-in templates', () => {
  it('cover every base type with enabled sections and a publication target', () => {
    for (const id of BASE_TYPES) {
      const t = builtinTemplate(id, false);
      expect(t.builtin).toBe(true);
      expect(t.draft.sections.length).toBeGreaterThan(0);
      expect(t.draft.sections.every((s) => s.enabled)).toBe(true);
      expect(t.published).toBe(t.draft);
      expect(t.draft.publication.childTitle).toBeTruthy();
    }
    expect(BUILTIN_TEMPLATES['recruitment-interview'].draft.grid.criteria.length).toBe(6);
    expect(BUILTIN_TEMPLATES['recruitment-interview'].draft.phases.length).toBe(5);
  });
});

describe('normalizeTemplateSpec', () => {
  const base = BUILTIN_TEMPLATES['recruitment-interview'].draft;

  it('keeps the editor values, slugs ids, dedupes and caps', () => {
    const spec = normalizeTemplateSpec(
      {
        sections: [
          { title: ' Résumé ', instruction: 'Cinq lignes.', length: 'detailed' },
          { title: 'Résumé', enabled: false },
          { title: '' },
        ],
        rules: '  Citer.  ',
        grid: { criteria: ['Expérience pertinente', { label: 'SAP', hint: 'FI/CO' }, 'SAP'] },
        phases: [{ title: 'Accueil', minutes: 5.4, questions: ['Parcours', '', 'Attentes'] }, { title: 'Accueil', minutes: -3 }],
        markerKinds: ['highlight', 'bogus', 'highlight'],
        publication: { childTitle: 'Entrevues Cadre', includeTranscript: false },
      },
      base,
    );
    expect(spec.sections.map((s) => [s.id, s.enabled, s.length])).toEqual([
      ['resume', true, 'detailed'],
      ['resume-2', false, 'short'],
    ]);
    expect(spec.rules).toBe('Citer.');
    expect(spec.grid.criteria).toEqual([
      { id: 'experience-pertinente', label: 'Expérience pertinente' },
      { id: 'sap', label: 'SAP', hint: 'FI/CO' },
    ]);
    expect(spec.phases).toEqual([
      { id: 'accueil', title: 'Accueil', minutes: 5, questions: ['Parcours', 'Attentes'] },
      { id: 'accueil-2', title: 'Accueil', minutes: null, questions: [] },
    ]);
    expect(spec.markerKinds).toEqual(['highlight']);
    expect(spec.publication).toEqual({ childTitle: 'Entrevues Cadre', includeTranscript: false });
  });

  it('falls back to the base for missing parts', () => {
    const spec = normalizeTemplateSpec({}, base);
    expect(spec.sections).toEqual(base.sections);
    expect(spec.rules).toBe(base.rules);
    expect(spec.grid.criteria).toEqual(base.grid.criteria);
    expect(spec.phases).toEqual(base.phases);
    expect(spec.markerKinds).toEqual(base.markerKinds);
    expect(spec.publication).toEqual(base.publication);
  });
});

describe('sections prompt and answer', () => {
  const spec = { ...BUILTIN_TEMPLATES['recruitment-interview'].draft, sections: [
    { id: 'summary', title: 'Résumé', enabled: true, instruction: 'Cinq lignes.', length: 'short' as const },
    { id: 'off', title: 'Désactivée', enabled: false, instruction: '', length: 'short' as const },
    { id: 'strengths', title: 'Forces', enabled: true, instruction: '', length: 'detailed' as const },
  ] };

  it('lists only enabled sections with their instruction and the template rules', () => {
    const { prompt, system, sections } = buildSectionsPrompt({ title: 'Entrevue', templateName: 'LTC Cadre', spec, transcript: 'T' });
    expect(sections.map((s) => s.id)).toEqual(['summary', 'strengths']);
    expect(prompt).toContain('"summary" · Résumé (court, 2 à 5 lignes) : Cinq lignes.');
    expect(prompt).toContain('"strengths" · Forces (détaillé, 6 à 12 lignes)');
    expect(prompt).not.toContain('Désactivée');
    expect(system).toContain('Règles du modèle : Ne jamais déduire');
  });

  it('parses the answer, fills missing sections and keeps the order', () => {
    const { sections } = buildSectionsPrompt({ title: 'E', templateName: 'T', spec, transcript: 'T' });
    const content = parseSectionsAnswer('```json\n{"sections":{"strengths":"- Rigueur","extra":"x"}}\n```', sections);
    expect(content).toEqual({ summary: '_Rien de consigné._', strengths: '- Rigueur' });
    const md = sectionsToMarkdown({ title: 'Entrevue — J. Tremblay', dateLabel: '13 oct. 2026', templateName: 'LTC Cadre' }, sections, content);
    expect(md).toBe('# Entrevue — J. Tremblay\n\n_13 oct. 2026 · LTC Cadre_\n\n## Résumé\n\n_Rien de consigné._\n\n## Forces\n\n- Rigueur\n');
    expect(legacyOutputsFromSections({ summary: '_Rien de consigné._', strengths: 'x', actions: '- a' })).toEqual({ actions: '- a' });
    expect(parseSectionsAnswer('pas du json', sections).summary).toBe('_Rien de consigné._');
  });
});
