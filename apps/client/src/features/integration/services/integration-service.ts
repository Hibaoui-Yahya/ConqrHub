import api from "@/lib/api-client";
import {
  CreateRelationshipRequest,
  IntegrationRelationship,
  PresentationModel,
  ProjectSpaceMapping,
  ResolveRequest,
} from "@/features/integration/types/integration.types";

export interface ProjectDocsResolution {
  primary?: { spaceId: string; name: string; slug: string; url: string };
  secondary: { spaceId: string; name: string; slug: string; url: string }[];
}

export async function getProjectDocs(
  planeProjectId: string,
): Promise<ProjectDocsResolution> {
  const res = await api.post<ProjectDocsResolution>(
    "/integrations/plane/project-docs",
    { planeProjectId },
  );
  return res.data;
}

export interface SpacePlaneTarget {
  planeProjectId?: string;
  url?: string;
}

export async function getSpacePlaneTarget(
  spaceId: string,
): Promise<SpacePlaneTarget> {
  const res = await api.post<SpacePlaneTarget>(
    "/integrations/space-plane-target",
    { spaceId },
  );
  return res.data;
}

export async function getMappingsForSpace(
  spaceId: string,
): Promise<ProjectSpaceMapping[]> {
  const res = await api.post<{ items: ProjectSpaceMapping[] }>(
    "/integrations/mappings",
    { spaceId },
  );
  return res.data.items;
}

export async function getAllMappings(): Promise<ProjectSpaceMapping[]> {
  const res = await api.post<{ items: ProjectSpaceMapping[] }>(
    "/integrations/mappings",
    {},
  );
  return res.data.items;
}

export async function setMapping(req: {
  planeProjectId: string;
  spaceId: string;
  mappingKind?: "primary" | "secondary";
}): Promise<ProjectSpaceMapping> {
  const res = await api.post<ProjectSpaceMapping>(
    "/integrations/mappings/set",
    req,
  );
  return res.data;
}

export async function removeMapping(id: string): Promise<void> {
  await api.post("/integrations/mappings/remove", { id });
}

export async function resolveSmartObjects(
  req: ResolveRequest,
): Promise<PresentationModel[]> {
  const res = await api.post<{ items: PresentationModel[] }>(
    "/integrations/resolve",
    req,
  );
  return res.data.items;
}

export async function getRelationships(
  urn: string,
): Promise<IntegrationRelationship[]> {
  const res = await api.post<{ items: IntegrationRelationship[] }>(
    "/integrations/relationships",
    { urn },
  );
  return res.data.items;
}

export async function createRelationship(
  req: CreateRelationshipRequest,
): Promise<IntegrationRelationship> {
  const res = await api.post<IntegrationRelationship>(
    "/integrations/relationships/create",
    req,
  );
  return res.data;
}

export async function removeRelationship(id: string): Promise<void> {
  await api.post("/integrations/relationships/remove", { id });
}

export interface WorkItemSearchResult {
  urn: string;
  id: string;
  key: number | null;
  name: string;
  state: string | null;
  priority: string | null;
}

export async function searchWorkItems(
  planeProjectId: string,
  search?: string,
): Promise<{ items: WorkItemSearchResult[]; integrationEnabled: boolean }> {
  const res = await api.post<{
    items: WorkItemSearchResult[];
    integrationEnabled: boolean;
  }>("/integrations/work-items/search", { planeProjectId, search });
  return res.data;
}

export interface CreateWorkItemFromHubRequest {
  sourceUrn: string;
  planeProjectId: string;
  title: string;
  descriptionHtml?: string;
  priority?: string;
  relationType?: string;
}

export interface CreateWorkItemFromHubResponse {
  status: "created" | "created_link_failed";
  workItemUrn: string;
  warning?: string;
}

export async function createWorkItemFromHub(
  req: CreateWorkItemFromHubRequest,
): Promise<CreateWorkItemFromHubResponse> {
  const res = await api.post<CreateWorkItemFromHubResponse>(
    "/integrations/work-items/create-from-hub",
    req,
  );
  return res.data;
}

export interface SuiteNotification {
  correlationId: string;
  outcome: string;
  subject: string;
  actorId: string | null;
  collapsedEventCount: number;
  at: string;
}

/** Recent deduped cross-product notifications (bell "Suite" feed, §5.3C). */
export async function getRecentSuiteNotifications(
  limit = 20,
): Promise<SuiteNotification[]> {
  const res = await api.post<{ items: SuiteNotification[] }>(
    "/integrations/notifications/recent",
    { limit },
  );
  return res.data.items;
}

export interface FederatedSearchItem {
  source: "hub" | "plane";
  type: string;
  urn: string;
  title: string;
  snippet?: string;
  key?: number | null;
  state?: string | null;
  deepLinkId?: string;
  deepLink?: string;
}

/** Permission-aware unified search across Hub + Plane (§5.3B). */
export async function federatedSearch(
  query: string,
): Promise<FederatedSearchItem[]> {
  const res = await api.post<{ items: FederatedSearchItem[] }>(
    "/integrations/search",
    { query },
  );
  return res.data.items;
}
