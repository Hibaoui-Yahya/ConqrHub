import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { RequirementRepo } from '@docmost/db/repos/integration/requirement.repo';

/**
 * The only thing this service needs from a page: which space it lives in, so
 * the mapped ConqrPlan project can be found. Declared narrowly and injected by
 * token rather than importing PageRepo's module graph, which drags an ESM
 * editor dependency into every consumer.
 */
export interface PageLocator {
  findById(
    pageId: string,
    opts?: { includeSpace?: boolean },
  ): Promise<{ id: string; workspaceId: string; spaceId: string | null } | undefined | null>;
}

/** DI token for {@link PageLocator}. */
export const PAGE_LOCATOR = 'PAGE_LOCATOR';
import { RelationshipService } from './relationship.service';
import { SmartObjectResolverService } from './smart-object-resolver.service';
import { WorkItemCreationService } from './work-item-creation.service';
import { ProjectSpaceMappingService } from './project-space-mapping.service';
import { buildUrn } from '../domain/urn.util';
import { RelationType } from '../domain/relationship-types';
import { PresentationModel, ResolutionState } from '../domain/presentation.types';

/**
 * Vertical Slice 01: requirement → linked ConqrPlan execution.
 *
 * The one flow this slice exists to make real: a delivery-accountable lead
 * opens a ConqrHub page, sees which requirements have no work behind them,
 * creates that work in ConqrPlan under their own identity, and watches its
 * delivery status without leaving the requirement's context.
 *
 * Ownership is not blurred to achieve it:
 *
 *   ConqrHub  owns the page, its requirements, their lifecycle, coverage, and
 *             every cross-product relationship (the Context Graph).
 *   ConqrPlan owns the work item, its assignment, estimate and delivery state,
 *             and remains the authority on who may touch it.
 *
 * There is no shared database, no cross-product write, and no distributed
 * transaction. Two systems each commit their own half, and convergence -
 * a deterministic idempotency key - replaces the rollback that cannot exist.
 */

/** How a requirement relates to the work behind it. */
export interface RequirementCoverage {
  requirementId: string;
  blockId: string;
  urn: string;
  title: string | null;
  state: string;
  /** True when at least one live delivery relationship exists. */
  covered: boolean;
  /**
   * Work linked to this requirement, already shaped for the viewer. Items the
   * viewer may not see appear as a restricted placeholder, never as metadata.
   */
  relatedWork: PresentationModel[];
}

export interface CreateLinkedWorkPreview {
  requirementUrn: string;
  requirementTitle: string | null;
  planeProjectId: string;
  proposed: { title: string; descriptionHtml?: string; priority?: string };
  relationType: RelationType;
  /** Stable, so confirming twice cannot create two items. */
  idempotencyKey: string;
  /** Set when work already exists for this requirement. */
  existingWork?: PresentationModel[];
}

export interface CreateLinkedWorkReceipt {
  status: 'created' | 'already_exists' | 'created_link_failed';
  requirementUrn: string;
  workItemUrn: string;
  workItemId: string;
  relationship: {
    /** Stored direction: requirement implemented_by work item. */
    relationType: RelationType;
    /** Derived direction: work item implements requirement. */
    inverseRelationType: RelationType;
    id?: string;
  } | null;
  actor: { hubUserId: string };
  correlationId: string;
  idempotencyKey: string;
  /** Present when ConqrPlan committed but ConqrHub's link did not. */
  warning?: string;
}

/**
 * The canonical direction for this slice.
 *
 * The edge is stored once, from the Hub requirement, as `implemented_by`; its
 * inverse - the work item `implements` the requirement - is derived from the
 * relation registry rather than stored again. ConqrHub's Context Graph is
 * authoritative for cross-product relationships, so ConqrPlan holds no second
 * copy that could disagree with it.
 *
 * `implemented_by` is also one of the delivery relations traceability already
 * counts as coverage, so linking work makes a requirement covered without a
 * parallel notion of coverage being invented here.
 */
const CANONICAL_RELATION = RelationType.ImplementedBy;

@Injectable()
export class RequirementDeliveryService {
  private readonly logger = new Logger(RequirementDeliveryService.name);

  constructor(
    private readonly requirements: RequirementRepo,
    private readonly relationships: RelationshipService,
    private readonly resolver: SmartObjectResolverService,
    private readonly creation: WorkItemCreationService,
    private readonly mappings: ProjectSpaceMappingService,
    @Inject(PAGE_LOCATOR) private readonly pages: PageLocator,
  ) {}

  /** URN of a requirement block. */
  static requirementUrn(pageId: string, blockId: string): string {
    return buildUrn('hub', 'page', pageId, blockId);
  }

  /**
   * A deterministic key for "work implementing this requirement in this
   * project".
   *
   * Deterministic on purpose: it is what makes a retry converge. The same
   * confirm pressed twice, a network timeout retried, or a repair after a
   * half-finished create all resolve to the same ConqrPlan work item instead
   * of creating a second one. It is scoped by project so the same requirement
   * can legitimately have work in two different projects.
   */
  static idempotencyKey(requirementUrn: string, planeProjectId: string): string {
    return `req:${requirementUrn}|project:${planeProjectId}`;
  }

  // -------------------------------------------------------------------------
  // Read: requirements on a page, with coverage and permission-shaped work
  // -------------------------------------------------------------------------

  async pageRequirements(params: {
    workspaceId: string;
    viewerId: string;
    pageId: string;
    planeProjectId?: string;
  }): Promise<RequirementCoverage[]> {
    const rows = await this.requirements.listForPage(
      params.workspaceId,
      params.pageId,
    );

    const projectId =
      params.planeProjectId ??
      (await this.resolveProjectForPage(params.workspaceId, params.pageId));

    const out: RequirementCoverage[] = [];
    for (const req of rows) {
      const urn = RequirementDeliveryService.requirementUrn(
        req.pageId,
        req.blockId,
      );
      const edges = await this.relationships.listForUrn(params.workspaceId, urn);
      const workUrns = edges
        .filter(
          (e) =>
            e.sourceUrn === urn &&
            e.relationType === CANONICAL_RELATION &&
            e.targetUrn.startsWith('conqr://plane/work-item/'),
        )
        .map((e) => e.targetUrn);

      // Resolved as the viewer. A viewer without access gets a restricted
      // placeholder, so the panel can say "there is work you cannot see"
      // without saying anything about it.
      const relatedWork = workUrns.length
        ? await this.resolver.resolveMany(workUrns, {
            workspaceId: params.workspaceId,
            viewerId: params.viewerId,
            planeProjectId: projectId ?? undefined,
          })
        : [];

      out.push({
        requirementId: req.id,
        blockId: req.blockId,
        urn,
        title: req.title,
        state: req.state,
        // Coverage is a property of the graph, not of what this viewer can
        // see. Hiding the fact that work exists because the viewer cannot open
        // it would make the page lie about delivery.
        covered: workUrns.length > 0,
        relatedWork,
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  /**
   * What would be created, without creating it.
   *
   * A preview step exists because this is a cross-product mutation the user
   * cannot undo from here: ConqrHub can drop its relationship, but it can
   * never delete the ConqrPlan work item.
   */
  async previewLinkedWork(params: {
    workspaceId: string;
    viewerId: string;
    requirementId: string;
    planeProjectId?: string;
    title?: string;
    descriptionHtml?: string;
    priority?: string;
  }): Promise<CreateLinkedWorkPreview> {
    const req = await this.requirements.findById(
      params.requirementId,
      params.workspaceId,
    );
    if (!req) throw new BadRequestException('Requirement not found');

    const urn = RequirementDeliveryService.requirementUrn(req.pageId, req.blockId);
    const projectId =
      params.planeProjectId ??
      (await this.resolveProjectForPage(params.workspaceId, req.pageId));
    if (!projectId) {
      throw new BadRequestException(
        'This page has no mapped ConqrPlan project. Map one before creating work.',
      );
    }

    const edges = await this.relationships.listForUrn(params.workspaceId, urn);
    const existingUrns = edges
      .filter((e) => e.sourceUrn === urn && e.relationType === CANONICAL_RELATION)
      .map((e) => e.targetUrn);

    return {
      requirementUrn: urn,
      requirementTitle: req.title,
      planeProjectId: projectId,
      proposed: {
        title: params.title?.trim() || req.title || 'Untitled requirement',
        descriptionHtml: params.descriptionHtml,
        priority: params.priority,
      },
      relationType: CANONICAL_RELATION,
      idempotencyKey: RequirementDeliveryService.idempotencyKey(urn, projectId),
      existingWork: existingUrns.length
        ? await this.resolver.resolveMany(existingUrns, {
            workspaceId: params.workspaceId,
            viewerId: params.viewerId,
            planeProjectId: projectId,
          })
        : undefined,
    };
  }

  // -------------------------------------------------------------------------
  // Confirm
  // -------------------------------------------------------------------------

  async createLinkedWork(params: {
    workspaceId: string;
    actorId: string;
    requirementId: string;
    planeProjectId?: string;
    title?: string;
    descriptionHtml?: string;
    priority?: string;
  }): Promise<CreateLinkedWorkReceipt> {
    const preview = await this.previewLinkedWork({
      workspaceId: params.workspaceId,
      viewerId: params.actorId,
      requirementId: params.requirementId,
      planeProjectId: params.planeProjectId,
      title: params.title,
      descriptionHtml: params.descriptionHtml,
      priority: params.priority,
    });

    // The write runs under the acting human's delegation inside
    // WorkItemCreationService: ConqrPlan authorises them, not the bridge.
    const result = await this.creation.createFromHub({
      workspaceId: params.workspaceId,
      actorId: params.actorId,
      sourceUrn: preview.requirementUrn,
      planeProjectId: preview.planeProjectId,
      title: preview.proposed.title,
      descriptionHtml: preview.proposed.descriptionHtml,
      priority: preview.proposed.priority,
      relationType: CANONICAL_RELATION,
      idempotencyKey: preview.idempotencyKey,
    });

    return {
      status: result.status,
      requirementUrn: preview.requirementUrn,
      workItemUrn: result.workItemUrn,
      workItemId: result.workItem.id,
      relationship: result.relationship
        ? {
            relationType: CANONICAL_RELATION,
            inverseRelationType: RelationType.Implements,
            id: result.relationship.id,
          }
        : null,
      actor: { hubUserId: params.actorId },
      correlationId: result.correlationId,
      idempotencyKey: preview.idempotencyKey,
      warning: result.warning,
    };
  }

  // -------------------------------------------------------------------------

  /**
   * The ConqrPlan project this page's work belongs in.
   *
   * Mapping lives on the space, not the page: a space is the unit a team
   * already thinks of as "our area", and per-page mapping would multiply the
   * places a wrong target could hide. The slice requires the page's space to
   * have a mapped project and says so plainly when it has none, rather than
   * guessing at a destination for someone's work.
   */
  private async resolveProjectForPage(
    workspaceId: string,
    pageId: string,
  ): Promise<string | null> {
    try {
      const page = await this.pages.findById(pageId, { includeSpace: false });
      if (!page || page.workspaceId !== workspaceId || !page.spaceId) return null;
      const target = await this.mappings.resolveSpacePlaneTarget(
        workspaceId,
        page.spaceId,
      );
      return target.planeProjectId ?? null;
    } catch (err) {
      this.logger.warn(
        `Could not resolve a ConqrPlan project for page ${pageId}: ${(err as Error).message}`,
      );
      return null;
    }
  }
}

export { ResolutionState };
