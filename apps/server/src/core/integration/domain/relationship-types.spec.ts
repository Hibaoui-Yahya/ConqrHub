import {
  allRelationTypes,
  cardinalityOf,
  inverseOf,
  isRelationType,
  labelOf,
  RelationType,
} from './relationship-types';

describe('relationship-types', () => {
  it('every relation type has a defined inverse', () => {
    for (const rel of allRelationTypes()) {
      expect(() => inverseOf(rel)).not.toThrow();
      expect(isRelationType(inverseOf(rel))).toBe(true);
    }
  });

  it('inverse is symmetric (inverse of inverse is self)', () => {
    for (const rel of allRelationTypes()) {
      expect(inverseOf(inverseOf(rel))).toBe(rel);
    }
  });

  it('maps known pairs correctly', () => {
    expect(inverseOf(RelationType.ImplementedBy)).toBe(RelationType.Implements);
    expect(inverseOf(RelationType.Implements)).toBe(RelationType.ImplementedBy);
    expect(inverseOf(RelationType.Supersedes)).toBe(RelationType.SupersededBy);
  });

  it('shares cardinality between the two directions of a pair', () => {
    for (const rel of allRelationTypes()) {
      expect(cardinalityOf(rel)).toBe(cardinalityOf(inverseOf(rel)));
    }
  });

  it('recognizes valid types and rejects junk', () => {
    expect(isRelationType('implements')).toBe(true);
    expect(isRelationType('is_related_to')).toBe(false);
  });

  it('provides a human label for every type', () => {
    for (const rel of allRelationTypes()) {
      expect(labelOf(rel).length).toBeGreaterThan(0);
    }
  });
});
