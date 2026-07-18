/**
 * Typed Work–Knowledge relationship vocabulary (blueprint §6.1, §8.2).
 *
 * Every relationship type has a defined inverse so the edge is navigable in
 * both directions, and a cardinality so callers can enforce "one primary spec
 * per work item" style rules. Storing meaning (not generic "related") is what
 * lets Conqr answer questions plain hyperlinks cannot.
 */

export enum RelationType {
  Implements = 'implements',
  ImplementedBy = 'implemented_by',
  SpecifiedBy = 'specified_by',
  Specifies = 'specifies',
  DocumentedBy = 'documented_by',
  Documents = 'documents',
  DecidedBy = 'decided_by',
  Decides = 'decides',
  ExplainedBy = 'explained_by',
  Explains = 'explains',
  OperationalizedBy = 'operationalized_by',
  Operationalizes = 'operationalizes',
  TestedBy = 'tested_by',
  Tests = 'tests',
  EvidencedBy = 'evidenced_by',
  Evidences = 'evidences',
  BlockedByDecision = 'blocked_by_decision',
  BlocksDelivery = 'blocks_delivery',
  Supersedes = 'supersedes',
  SupersededBy = 'superseded_by',
  DerivedFrom = 'derived_from',
  SourceOf = 'source_of',
  MentionedIn = 'mentioned_in',
  Mentions = 'mentions',
  HandledBy = 'handled_by',
  Handles = 'handles',
  AnalyzedIn = 'analyzed_in',
  Analyzes = 'analyzes',
}

export type Cardinality = 'one-to-one' | 'one-to-many' | 'many-to-many';

interface RelationDef {
  inverse: RelationType;
  cardinality: Cardinality;
  /** Human label shown in backlink/knowledge panels. */
  label: string;
}

/**
 * Each pair is declared once; the reverse entry is derived below so the two can
 * never drift out of sync.
 */
const FORWARD: Partial<Record<RelationType, RelationDef>> = {
  [RelationType.ImplementedBy]: {
    inverse: RelationType.Implements,
    cardinality: 'many-to-many',
    label: 'Implemented by',
  },
  [RelationType.SpecifiedBy]: {
    inverse: RelationType.Specifies,
    cardinality: 'many-to-many',
    label: 'Specified by',
  },
  [RelationType.DocumentedBy]: {
    inverse: RelationType.Documents,
    cardinality: 'many-to-many',
    label: 'Documented by',
  },
  [RelationType.DecidedBy]: {
    inverse: RelationType.Decides,
    cardinality: 'many-to-many',
    label: 'Decided by',
  },
  [RelationType.ExplainedBy]: {
    inverse: RelationType.Explains,
    cardinality: 'many-to-many',
    label: 'Explained by',
  },
  [RelationType.OperationalizedBy]: {
    inverse: RelationType.Operationalizes,
    cardinality: 'many-to-many',
    label: 'Operationalized by',
  },
  [RelationType.TestedBy]: {
    inverse: RelationType.Tests,
    cardinality: 'many-to-many',
    label: 'Tested by',
  },
  [RelationType.EvidencedBy]: {
    inverse: RelationType.Evidences,
    cardinality: 'many-to-many',
    label: 'Evidenced by',
  },
  [RelationType.BlockedByDecision]: {
    inverse: RelationType.BlocksDelivery,
    cardinality: 'many-to-many',
    label: 'Blocked by decision',
  },
  [RelationType.Supersedes]: {
    inverse: RelationType.SupersededBy,
    cardinality: 'one-to-many',
    label: 'Supersedes',
  },
  [RelationType.DerivedFrom]: {
    inverse: RelationType.SourceOf,
    cardinality: 'many-to-many',
    label: 'Derived from',
  },
  [RelationType.MentionedIn]: {
    inverse: RelationType.Mentions,
    cardinality: 'many-to-many',
    label: 'Mentioned in',
  },
  [RelationType.HandledBy]: {
    inverse: RelationType.Handles,
    cardinality: 'many-to-many',
    label: 'Handled by',
  },
  [RelationType.AnalyzedIn]: {
    inverse: RelationType.Analyzes,
    cardinality: 'many-to-many',
    label: 'Analyzed in',
  },
};

const REGISTRY: Record<RelationType, RelationDef> = (() => {
  const reg = {} as Record<RelationType, RelationDef>;
  for (const [key, def] of Object.entries(FORWARD)) {
    const forward = key as RelationType;
    reg[forward] = def;
    // Derive the reverse direction from the forward declaration.
    reg[def.inverse] = {
      inverse: forward,
      cardinality: def.cardinality,
      label: reverseLabel(forward, def.label),
    };
  }
  return reg;
})();

function reverseLabel(forward: RelationType, forwardLabel: string): string {
  const reverseLabels: Partial<Record<RelationType, string>> = {
    [RelationType.ImplementedBy]: 'Implements',
    [RelationType.SpecifiedBy]: 'Specifies',
    [RelationType.DocumentedBy]: 'Documents',
    [RelationType.DecidedBy]: 'Decides',
    [RelationType.ExplainedBy]: 'Explains',
    [RelationType.OperationalizedBy]: 'Operationalizes',
    [RelationType.TestedBy]: 'Tests',
    [RelationType.EvidencedBy]: 'Evidences',
    [RelationType.BlockedByDecision]: 'Blocks delivery',
    [RelationType.Supersedes]: 'Superseded by',
    [RelationType.DerivedFrom]: 'Source of',
    [RelationType.MentionedIn]: 'Mentions',
    [RelationType.HandledBy]: 'Handles',
    [RelationType.AnalyzedIn]: 'Analyzes',
  };
  return reverseLabels[forward] ?? forwardLabel;
}

export function isRelationType(value: string): value is RelationType {
  return Object.prototype.hasOwnProperty.call(REGISTRY, value);
}

export function inverseOf(relation: RelationType): RelationType {
  const def = REGISTRY[relation];
  if (!def) throw new Error(`Unknown relation type: ${relation}`);
  return def.inverse;
}

export function cardinalityOf(relation: RelationType): Cardinality {
  const def = REGISTRY[relation];
  if (!def) throw new Error(`Unknown relation type: ${relation}`);
  return def.cardinality;
}

export function labelOf(relation: RelationType): string {
  return REGISTRY[relation]?.label ?? relation;
}

export function allRelationTypes(): RelationType[] {
  return Object.keys(REGISTRY) as RelationType[];
}

/** Lifecycle of an edge (blueprint §8.2: active/superseded/orphaned/deleted). */
export enum RelationshipLifecycle {
  Active = 'active',
  Superseded = 'superseded',
  Orphaned = 'orphaned',
  Deleted = 'deleted',
}
