// Conqr Integration Layer — client types. The cross-product presentation
// contract now lives in the shared @conqr/integration-ui package (blueprint
// §7.1/§8.6); re-exported here so existing imports keep working.
export type {
  PresentationModel,
  ResolutionState,
  SmartObjectAction,
} from "@conqr/integration-ui";

export interface IntegrationRelationship {
  id: string;
  workspaceId: string;
  sourceUrn: string;
  sourceType: string;
  targetUrn: string;
  targetType: string;
  relationType: string;
  inverseRelationType: string;
  lifecycleState: string;
  provenance: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSpaceMapping {
  id: string;
  workspaceId: string;
  planeProjectId: string;
  spaceId: string;
  mappingKind: "primary" | "secondary";
  createdAt: string;
}

export interface ResolveRequest {
  urns: string[];
  planeProjectId?: string;
  displayMode?: string;
}

export interface CreateRelationshipRequest {
  sourceUrn: string;
  targetUrn: string;
  relationType: string;
  provenance?: string;
  metadata?: Record<string, unknown>;
}
