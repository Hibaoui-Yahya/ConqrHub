// Human labels for relationship types, mirroring the server registry
// (blueprint §6.1). Used to group backlinks by meaning in the Knowledge panel.

const LABELS: Record<string, string> = {
  implements: "Implements",
  implemented_by: "Implemented by",
  specifies: "Specifies",
  specified_by: "Specified by",
  documents: "Documents",
  documented_by: "Documented by",
  decides: "Decides",
  decided_by: "Decided by",
  explains: "Explains",
  explained_by: "Explained by",
  operationalizes: "Operationalizes",
  operationalized_by: "Operationalized by",
  tests: "Tests",
  tested_by: "Tested by",
  evidences: "Evidences",
  evidenced_by: "Evidenced by",
  blocks_delivery: "Blocks delivery",
  blocked_by_decision: "Blocked by decision",
  supersedes: "Supersedes",
  superseded_by: "Superseded by",
  derived_from: "Derived from",
  source_of: "Source of",
  mentions: "Mentions",
  mentioned_in: "Mentioned in",
  handles: "Handles",
  handled_by: "Handled by",
  analyzes: "Analyzes",
  analyzed_in: "Analyzed in",
};

export function relationLabel(relationType: string): string {
  return LABELS[relationType] ?? relationType;
}
