import {
  APPROVED_OR_BEYOND,
  canTransition,
  isRequirementState,
  RequirementState,
} from './requirement-lifecycle';

describe('requirement-lifecycle', () => {
  it('recognizes valid states', () => {
    expect(isRequirementState('approved')).toBe(true);
    expect(isRequirementState('nope')).toBe(false);
  });

  it('permits legal forward transitions', () => {
    expect(canTransition(RequirementState.Draft, RequirementState.InReview)).toBe(true);
    expect(canTransition(RequirementState.Approved, RequirementState.Implementing)).toBe(true);
    expect(canTransition(RequirementState.Implementing, RequirementState.Verified)).toBe(true);
  });

  it('forbids skipping states and self-transitions', () => {
    expect(canTransition(RequirementState.Draft, RequirementState.Verified)).toBe(false);
    expect(canTransition(RequirementState.Draft, RequirementState.Draft)).toBe(false);
  });

  it('allows superseding from any active state but not out of superseded', () => {
    expect(canTransition(RequirementState.Approved, RequirementState.Superseded)).toBe(true);
    expect(canTransition(RequirementState.Superseded, RequirementState.Draft)).toBe(false);
  });

  it('counts approved/implementing/verified as committed', () => {
    expect(APPROVED_OR_BEYOND.has(RequirementState.Approved)).toBe(true);
    expect(APPROVED_OR_BEYOND.has(RequirementState.Draft)).toBe(false);
  });
});
