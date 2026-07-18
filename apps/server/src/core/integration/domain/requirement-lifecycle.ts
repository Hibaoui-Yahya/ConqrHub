/**
 * Requirement block lifecycle (blueprint §6.2). Every requirement block gets a
 * stable id and moves through a controlled lifecycle so coverage/traceability
 * can be computed ("approved requirements with no delivery work", etc.).
 */

export enum RequirementState {
  Draft = 'draft',
  InReview = 'in_review',
  Approved = 'approved',
  Implementing = 'implementing',
  Verified = 'verified',
  Superseded = 'superseded',
}

// Allowed forward/lateral transitions. Superseded is reachable from anywhere.
const TRANSITIONS: Record<RequirementState, RequirementState[]> = {
  [RequirementState.Draft]: [RequirementState.InReview, RequirementState.Superseded],
  [RequirementState.InReview]: [
    RequirementState.Approved,
    RequirementState.Draft,
    RequirementState.Superseded,
  ],
  [RequirementState.Approved]: [
    RequirementState.Implementing,
    RequirementState.InReview,
    RequirementState.Superseded,
  ],
  [RequirementState.Implementing]: [
    RequirementState.Verified,
    RequirementState.Approved,
    RequirementState.Superseded,
  ],
  [RequirementState.Verified]: [
    RequirementState.Implementing,
    RequirementState.Superseded,
  ],
  [RequirementState.Superseded]: [],
};

export function isRequirementState(v: string): v is RequirementState {
  return Object.values(RequirementState).includes(v as RequirementState);
}

export function canTransition(
  from: RequirementState,
  to: RequirementState,
): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** States that count as "committed to delivery" for coverage math. */
export const APPROVED_OR_BEYOND: ReadonlySet<RequirementState> = new Set([
  RequirementState.Approved,
  RequirementState.Implementing,
  RequirementState.Verified,
]);
