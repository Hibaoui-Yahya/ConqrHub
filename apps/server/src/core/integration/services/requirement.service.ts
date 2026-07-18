import { BadRequestException, Injectable } from '@nestjs/common';
import { RequirementRepo } from '@docmost/db/repos/integration/requirement.repo';
import { IntegrationRequirement } from '@docmost/db/types/entity.types';
import {
  APPROVED_OR_BEYOND,
  canTransition,
  isRequirementState,
  RequirementState,
} from '../domain/requirement-lifecycle';
import { TraceabilityService } from './traceability.service';
import { buildUrn } from '../domain/urn.util';

export interface CoverageGap {
  requirementId: string;
  blockId: string;
  title: string | null;
  state: string;
  reason: 'no_delivery_work' | 'incomplete';
  coverage: number | null;
}

/**
 * Requirement-block lifecycle + coverage rollup (blueprint §6.2). Registers
 * requirement blocks, enforces the state machine, and — combined with the
 * relationship graph — answers "which approved requirements have no (or
 * incomplete) delivery work?".
 */
@Injectable()
export class RequirementService {
  constructor(
    private readonly requirements: RequirementRepo,
    private readonly traceability: TraceabilityService,
  ) {}

  async register(input: {
    workspaceId: string;
    actorId: string;
    pageId: string;
    blockId: string;
    title?: string;
  }): Promise<IntegrationRequirement> {
    if (!input.blockId?.trim()) {
      throw new BadRequestException('blockId is required');
    }
    const row = await this.requirements.upsert({
      workspaceId: input.workspaceId,
      pageId: input.pageId,
      blockId: input.blockId,
      title: input.title ?? null,
      createdBy: input.actorId,
      state: RequirementState.Draft,
    });
    return row!;
  }

  async transition(
    workspaceId: string,
    id: string,
    to: string,
  ): Promise<IntegrationRequirement> {
    if (!isRequirementState(to)) {
      throw new BadRequestException(`Unknown requirement state: ${to}`);
    }
    const req = await this.requirements.findById(id, workspaceId);
    if (!req) throw new BadRequestException('Requirement not found');
    if (!canTransition(req.state as RequirementState, to)) {
      throw new BadRequestException(
        `Illegal transition ${req.state} → ${to}`,
      );
    }
    await this.requirements.updateState(id, workspaceId, to);
    return { ...req, state: to };
  }

  listForPage(workspaceId: string, pageId: string) {
    return this.requirements.listForPage(workspaceId, pageId);
  }

  /**
   * Coverage gaps across approved-or-beyond requirements: those with no linked
   * delivery work, or with incomplete work. This is the §6.2 headline query
   * that plain hyperlinks cannot answer.
   */
  async coverageGaps(
    workspaceId: string,
    viewerId: string,
    planeProjectId?: string,
  ): Promise<{ total: number; gaps: CoverageGap[] }> {
    const approved: IntegrationRequirement[] = [];
    for (const state of APPROVED_OR_BEYOND) {
      approved.push(...(await this.requirements.listByState(workspaceId, state)));
    }

    const gaps: CoverageGap[] = [];
    for (const req of approved) {
      const urn = buildUrn('hub', 'page', req.pageId, req.blockId);
      const cov = await this.traceability.pageCoverage(
        workspaceId,
        urn,
        viewerId,
        planeProjectId,
      );
      if (!cov.hasDeliveryWork) {
        gaps.push({
          requirementId: req.id,
          blockId: req.blockId,
          title: req.title,
          state: req.state,
          reason: 'no_delivery_work',
          coverage: null,
        });
      } else if ((cov.coverage ?? 0) < 1) {
        gaps.push({
          requirementId: req.id,
          blockId: req.blockId,
          title: req.title,
          state: req.state,
          reason: 'incomplete',
          coverage: cov.coverage,
        });
      }
    }
    return { total: approved.length, gaps };
  }
}
