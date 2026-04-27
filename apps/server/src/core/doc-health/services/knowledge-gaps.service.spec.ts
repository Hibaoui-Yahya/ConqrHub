import {
  buildRecommendations,
  deriveTitle,
} from './knowledge-gaps.service';

describe('deriveTitle', () => {
  it('strips trailing punctuation and capitalizes', () => {
    expect(deriveTitle('how do I reset MFA?')).toBe('How do I reset MFA');
  });

  it('collapses internal whitespace', () => {
    expect(deriveTitle('  how    do  I  rotate keys?  ')).toBe(
      'How do I rotate keys',
    );
  });

  it('caps long titles with an ellipsis', () => {
    const long =
      'why is the deployment pipeline so slow on tuesdays after we changed the artifact storage backend last quarter';
    const result = deriveTitle(long);
    expect(result.length).toBeLessThanOrEqual(82);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns Untitled for an empty question', () => {
    expect(deriveTitle('   ')).toBe('Untitled');
  });
});

describe('buildRecommendations', () => {
  it('returns only create_page when there is no top match', () => {
    const recs = buildRecommendations('how do I rotate keys?', null);
    expect(recs).toHaveLength(1);
    expect(recs[0].kind).toBe('create_page');
    expect(recs[0].detail).toContain('How do I rotate keys');
  });

  it('adds update_outdated when the top match is older than 180 days', () => {
    const oldDate = new Date(Date.now() - 200 * 86_400_000);
    const recs = buildRecommendations('how do I deploy?', {
      id: 'p-1',
      slugId: 'slug001',
      title: 'Deployment guide',
      ownerId: 'u-1',
      ownerActive: true,
      updatedAt: oldDate,
      spaceSlug: 'engineering',
    });
    const kinds = recs.map((r) => r.kind).sort();
    expect(kinds).toEqual(['create_page', 'update_outdated']);
    const update = recs.find((r) => r.kind === 'update_outdated')!;
    expect(update.pageId).toBe('p-1');
    expect(update.spaceSlug).toBe('engineering');
  });

  it('adds assign_owner when the top match has no active owner', () => {
    const recent = new Date(Date.now() - 5 * 86_400_000);
    const recs = buildRecommendations('how do I deploy?', {
      id: 'p-1',
      slugId: 'slug001',
      title: 'Deployment guide',
      ownerId: null,
      ownerActive: false,
      updatedAt: recent,
      spaceSlug: 'engineering',
    });
    const kinds = recs.map((r) => r.kind).sort();
    expect(kinds).toEqual(['assign_owner', 'create_page']);
  });

  it('emits both update_outdated and assign_owner when both apply', () => {
    const oldDate = new Date(Date.now() - 400 * 86_400_000);
    const recs = buildRecommendations('how do I deploy?', {
      id: 'p-1',
      slugId: 'slug001',
      title: 'Deployment guide',
      ownerId: null,
      ownerActive: false,
      updatedAt: oldDate,
      spaceSlug: 'engineering',
    });
    expect(recs).toHaveLength(3);
    const kinds = recs.map((r) => r.kind).sort();
    expect(kinds).toEqual(['assign_owner', 'create_page', 'update_outdated']);
  });

  it('omits enrichment recommendations when the top match is healthy', () => {
    const recent = new Date(Date.now() - 5 * 86_400_000);
    const recs = buildRecommendations('how do I deploy?', {
      id: 'p-1',
      slugId: 'slug001',
      title: 'Deployment guide',
      ownerId: 'u-1',
      ownerActive: true,
      updatedAt: recent,
      spaceSlug: 'engineering',
    });
    expect(recs).toHaveLength(1);
    expect(recs[0].kind).toBe('create_page');
  });
});
