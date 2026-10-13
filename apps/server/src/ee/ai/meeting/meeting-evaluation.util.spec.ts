import {
  DEFAULT_CRITERIA,
  applyEvaluationEdit,
  buildEvaluationMarkdown,
  buildEvaluationPrompt,
  normalizeCriteria,
  parseEvaluation,
  transcriptForEvaluation,
  verifyCitation,
  type MeetingEvaluation,
} from './meeting-evaluation.util';

const segments = [
  { id: 's1', speaker: 'S1', startMs: 0, text: 'Parlez-moi d’un projet dont vous êtes fière.' },
  {
    id: 's2',
    speaker: 'S2',
    startMs: 65_000,
    text: 'J’ai mené la refonte du processus de clôture : le délai est passé de douze jours à cinq, avec une équipe de quatre analystes.',
  },
  { id: 's3', speaker: 'S2', startMs: 130_000, text: 'Je suis disponible dès janvier.' },
];
const speakers = { S1: { displayName: 'Marie (LTC)' }, S2: { displayName: 'Candidate' } };

describe('normalizeCriteria', () => {
  it('falls back to the default grid', () => {
    expect(normalizeCriteria(undefined)).toBe(DEFAULT_CRITERIA);
    expect(normalizeCriteria(['  ', ''])).toBe(DEFAULT_CRITERIA);
  });
  it('slugs labels, drops duplicates and keeps the default hint for a known id', () => {
    const out = normalizeCriteria(['Compétences techniques', 'Anglais écrit', 'anglais écrit', { label: 'SAP', hint: 'FI/CO' }]);
    expect(out.map((c) => c.id)).toEqual(['skills', 'anglais-ecrit', 'sap']);
    expect(out[0].hint).toBe(DEFAULT_CRITERIA[1].hint);
    expect(out[2].hint).toBe('FI/CO');
  });
});

describe('transcriptForEvaluation / buildEvaluationPrompt', () => {
  it('prefixes each line with the segment id, stamp and name, within the budget', () => {
    const text = transcriptForEvaluation(segments, speakers, 10_000);
    expect(text.split('\n')[1]).toMatch(/^\[s2 01:05 Candidate\] J’ai mené/);
    expect(transcriptForEvaluation(segments, speakers, 60).split('\n')).toHaveLength(1);
    const { prompt } = buildEvaluationPrompt({ title: 'Entrevue', criteria: DEFAULT_CRITERIA, transcript: text });
    expect(prompt).toContain('"experience": Expérience pertinente');
    expect(prompt).toContain('[s2 01:05 Candidate]');
  });
});

describe('verifyCitation', () => {
  it('keeps a quote found in the cited segment, with its stamp', () => {
    expect(verifyCitation({ segmentId: 's2', quote: 'le délai est passé de douze jours à cinq' }, segments)).toEqual({
      segmentId: 's2',
      atMs: 65_000,
      speaker: 'S2',
      quote: 'le délai est passé de douze jours à cinq',
    });
  });
  it('tolerates accents, case and punctuation, and a wrong segment id', () => {
    expect(verifyCitation({ segmentId: 's1', quote: 'Le delai est passe de douze jours a cinq.' }, segments)?.segmentId).toBe('s2');
  });
  it('rejects an invented or too short quote', () => {
    expect(verifyCitation({ segmentId: 's2', quote: 'elle a doublé le chiffre d’affaires' }, segments)).toBeNull();
    expect(verifyCitation({ segmentId: 's3', quote: 'janvier' }, segments)).toBeNull();
  });
});

describe('parseEvaluation', () => {
  const answer = JSON.stringify({
    criteria: [
      {
        id: 'experience',
        level: 4,
        rationale: 'Réalisation chiffrée et récente.',
        citations: [
          { segmentId: 's2', quote: 'le délai est passé de douze jours à cinq' },
          { segmentId: 's2', quote: 'Le délai est passé de douze jours à cinq' },
          { segmentId: 's2', quote: 'elle a doublé le chiffre d’affaires' },
        ],
      },
      { id: 'skills', level: 3, rationale: 'Aucun détail technique.', citations: [] },
      { id: 'unknown-id', level: 4, citations: [] },
    ],
    overall: { recommendation: 'advance', summary: 'Profil solide.' },
  });

  it('builds one item per grid criterion, verifies citations, drops unsupported levels', () => {
    const ev = parseEvaluation('```json\n' + answer + '\n```', DEFAULT_CRITERIA, segments, {
      transcriptVersion: 3,
      now: new Date('2026-10-13T10:00:00Z'),
    });
    expect(ev.items.map((i) => i.criterionId)).toEqual(DEFAULT_CRITERIA.map((c) => c.id));
    const exp = ev.items[0];
    expect(exp.level).toBe(4);
    expect(exp.citations).toHaveLength(1); // duplicate and invented quotes dropped
    expect(exp.citations[0].atMs).toBe(65_000);
    const skills = ev.items[1];
    expect(skills.level).toBeNull(); // a level without evidence is not kept
    expect(skills.rationale).toBe('Aucun détail technique.');
    expect(ev.items[2].level).toBeNull();
    expect(ev.overall).toEqual({ recommendation: 'advance', summary: 'Profil solide.' });
    expect(ev.status).toBe('draft');
    expect(ev.transcriptVersion).toBe(3);
    expect(ev.generatedAt).toBe('2026-10-13T10:00:00.000Z');
  });

  it('survives an unparseable answer', () => {
    const ev = parseEvaluation('Désolé, je ne peux pas.', DEFAULT_CRITERIA, segments, { transcriptVersion: null });
    expect(ev.items.every((i) => i.level === null && i.citations.length === 0)).toBe(true);
    expect(ev.overall.recommendation).toBeNull();
  });
});

describe('applyEvaluationEdit', () => {
  const base: MeetingEvaluation = parseEvaluation(
    JSON.stringify({
      criteria: [
        { id: 'experience', level: 4, rationale: 'r', citations: [{ segmentId: 's2', quote: 'le délai est passé de douze jours à cinq' }, { segmentId: 's3', quote: 'Je suis disponible dès janvier' }] },
      ],
      overall: { recommendation: 'advance', summary: 's' },
    }),
    DEFAULT_CRITERIA,
    segments,
    { transcriptVersion: 1 },
  );

  it('applies levels, comments, citation removal and the recommendation; validates with the actor', () => {
    const out = applyEvaluationEdit(
      base,
      {
        status: 'validated',
        items: [
          { criterionId: 'experience', level: 3, comment: ' Bonne réalisation, périmètre limité. ', citations: [{ segmentId: 's3' }] },
          { criterionId: 'skills', level: 2, comment: 'Vu dans le CV.' },
          { criterionId: 'nope', level: 4 },
        ],
        overall: { recommendation: 'discuss', summary: 'À valider avec le client.' },
      },
      { userId: 'u1', now: new Date('2026-10-13T11:00:00Z') },
    );
    expect(out.items[0]).toMatchObject({ level: 3, comment: 'Bonne réalisation, périmètre limité.' });
    expect(out.items[0].citations.map((c) => c.segmentId)).toEqual(['s3']);
    expect(out.items[1]).toMatchObject({ level: 2, comment: 'Vu dans le CV.' });
    expect(out.items).toHaveLength(DEFAULT_CRITERIA.length);
    expect(out.overall).toEqual({ recommendation: 'discuss', summary: 'À valider avec le client.' });
    expect(out.status).toBe('validated');
    expect(out.validatedAt).toBe('2026-10-13T11:00:00.000Z');
    expect(out.validatedById).toBe('u1');
    // Criteria and citations are never added by hand.
    expect(out.criteria).toBe(base.criteria);
  });

  it('keeps the first validation when edited again, and clears it on reopen', () => {
    const v1 = applyEvaluationEdit(base, { status: 'validated' }, { userId: 'u1', now: new Date('2026-10-13T11:00:00Z') });
    const v2 = applyEvaluationEdit(v1, { items: [{ criterionId: 'experience', level: 2 }] }, { userId: 'u2', now: new Date('2026-10-14T11:00:00Z') });
    expect(v2.status).toBe('validated');
    expect(v2.validatedAt).toBe('2026-10-13T11:00:00.000Z');
    expect(v2.validatedById).toBe('u1');
    const re = applyEvaluationEdit(v2, { status: 'draft' }, { userId: 'u2' });
    expect(re).toMatchObject({ status: 'draft', validatedAt: null, validatedById: null });
  });

  it('ignores an invalid level or recommendation', () => {
    const out = applyEvaluationEdit(base, { items: [{ criterionId: 'experience', level: 9 }], overall: { recommendation: 'hire' } }, { userId: 'u1' });
    expect(out.items[0].level).toBeNull();
    expect(out.overall.recommendation).toBeNull();
  });
});

describe('buildEvaluationMarkdown', () => {
  it('renders the recommendation, the grid and the cited evidence with stamps', () => {
    const ev = applyEvaluationEdit(
      parseEvaluation(
        JSON.stringify({
          criteria: [{ id: 'experience', level: 4, rationale: 'Réalisation chiffrée.', citations: [{ segmentId: 's2', quote: 'le délai est passé de douze jours à cinq' }] }],
          overall: { recommendation: 'advance', summary: 'Profil solide.' },
        }),
        DEFAULT_CRITERIA.slice(0, 2),
        segments,
        { transcriptVersion: 1 },
      ),
      { items: [{ criterionId: 'experience', comment: 'À confirmer avec les références.' }] },
      { userId: 'u1' },
    );
    const md = buildEvaluationMarkdown(ev, speakers);
    expect(md).toContain('## Évaluation des compétences');
    expect(md).toContain('**Recommandation :** Recommander au client');
    expect(md).toContain('| Expérience pertinente | 4/4 · Excellent |');
    expect(md).toContain('| Compétences techniques | Non évalué |');
    expect(md).toContain('> « le délai est passé de douze jours à cinq » — Candidate, 01:05');
    expect(md).toContain('**Note du recruteur :** À confirmer avec les références.');
  });
});
