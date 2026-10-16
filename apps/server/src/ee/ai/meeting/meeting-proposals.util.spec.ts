import {
  duplicateSearchQuery,
  matchEvidenceSegments,
  rankDuplicateCandidates,
  resolveMappedProject,
  titleSimilarity,
} from './meeting-proposals.util';

const segments = [
  { id: 's0', text: 'Bonjour à tous, on fait le point sur le budget du projet Atlas.' },
  { id: 's1', text: 'Marie prépare le plan de recrutement pour vendredi.' },
  { id: 's2', text: 'Paul enverra le contrat au client lundi prochain.' },
  { id: 's3', text: 'Très bien.', rawText: 'tres bien' },
];

describe('matchEvidenceSegments', () => {
  it('finds the segment a verbatim quote comes from, ignoring case, accents and punctuation', () => {
    expect(matchEvidenceSegments('marie prepare le plan de recrutement', segments)).toEqual(['s1']);
  });

  it('cites every segment of a quote that spans several turns, in transcript order', () => {
    expect(
      matchEvidenceSegments(
        'Paul enverra le contrat au client lundi prochain. Marie prépare le plan de recrutement pour vendredi.',
        segments,
      ),
    ).toEqual(['s1', 's2']);
  });

  it('matches a re-worded sentence by its words, never guesses below the threshold', () => {
    expect(matchEvidenceSegments('Paul enverra au client le contrat lundi', segments)).toEqual(['s2']);
    expect(matchEvidenceSegments('On recrute deux développeurs en novembre', segments)).toEqual([]);
    expect(matchEvidenceSegments('', segments)).toEqual([]);
    expect(matchEvidenceSegments('Paul enverra le contrat', [])).toEqual([]);
  });
});

describe('duplicate detection', () => {
  it('scores titles by shared words', () => {
    expect(titleSimilarity('Envoyer le contrat au client', 'envoyer contrat client')).toBeGreaterThan(0.7);
    expect(titleSimilarity('Envoyer le contrat', 'Préparer le budget')).toBeLessThan(0.5);
  });

  it('keeps and ranks only similar hits, with their Plan identifiers', () => {
    const ranked = rankDuplicateCandidates('Envoyer le contrat au client', [
      { id: 'w1', name: 'Préparer le budget Atlas', project_id: 'p1' },
      { id: 'w2', name: 'Envoyer le contrat au client Atlas', project_id: 'p1', project__identifier: 'ATL', sequence_id: 12, state__name: 'Todo', state__group: 'unstarted' },
      { id: 'w3', name: 'Envoyer le contrat au client', project_id: 'p1' },
    ]);
    expect(ranked.map((c) => c.id)).toEqual(['w3', 'w2']);
    expect(ranked[0].similarity).toBe(1);
    expect(ranked[1]).toMatchObject({ identifier: 'ATL', sequenceId: 12, state: 'Todo', stateGroup: 'unstarted' });
  });

  it('searches on the meaningful words of the title', () => {
    expect(duplicateSearchQuery('Envoyer le contrat au client')).toBe('Envoyer contrat client');
  });
});

describe('resolveMappedProject', () => {
  it('takes the single primary project, else the single project, else nothing', () => {
    expect(resolveMappedProject([{ planeProjectId: 'p1', mappingKind: 'primary' }])).toEqual({ projectId: 'p1', candidates: ['p1'] });
    expect(
      resolveMappedProject([
        { planeProjectId: 'p1', mappingKind: 'primary' },
        { planeProjectId: 'p2', mappingKind: 'secondary' },
      ]).projectId,
    ).toBe('p1');
    expect(resolveMappedProject([{ planeProjectId: 'p2', mappingKind: 'secondary' }]).projectId).toBe('p2');
    expect(
      resolveMappedProject([
        { planeProjectId: 'p1', mappingKind: 'primary' },
        { planeProjectId: 'p2', mappingKind: 'primary' },
      ]),
    ).toEqual({ projectId: null, candidates: ['p1', 'p2'] });
    expect(resolveMappedProject([])).toEqual({ projectId: null, candidates: [] });
  });
});
