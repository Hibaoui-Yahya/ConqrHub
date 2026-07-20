import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MeetingIntelligenceRepo } from '@docmost/db/repos/meeting/meeting-intelligence.repo';
import {
  Meeting,
  MeetingActionProposal,
  User,
} from '@docmost/db/types/entity.types';
import { PlaneClientService } from '../../../core/integration/services/plane-client.service';
import { PageService } from '../../../core/page/services/page.service';
import SpaceAbilityFactory from '../../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../../core/casl/interfaces/space-ability.type';
import { ProposalSeed } from './meeting-types/meeting-type.types';

const EXECUTABLE_TARGETS = new Set(['conqrhub', 'conqrplane']);

interface ProposalValidation {
  warnings: string[];
  missingFields: string[];
}

/**
 * Action-proposal lifecycle (D9/D10): build from extraction seeds with
 * duplicate detection and validation; approve/reject/edit; execute ONLY
 * approved proposals against real integrations, recording real results.
 */
@Injectable()
export class MeetingProposalsService {
  private readonly logger = new Logger(MeetingProposalsService.name);

  constructor(
    private readonly repo: MeetingIntelligenceRepo,
    private readonly planeClient: PlaneClientService,
    private readonly pageService: PageService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  // ---- creation from extraction seeds ----

  async createFromSeeds(params: {
    meeting: Meeting;
    workspaceId: string;
    transcriptVersion: number;
    documentId: string | null;
    seeds: ProposalSeed[];
  }): Promise<MeetingActionProposal[]> {
    const created: MeetingActionProposal[] = [];
    for (const seed of params.seeds) {
      const validation = await this.validateSeed(seed);
      const duplicateCheck = await this.duplicateCheck(seed);
      const idempotencyKey = this.idempotencyKey(params.meeting.id, seed);
      const row = await this.repo.insertProposal({
        meetingId: params.meeting.id,
        workspaceId: params.workspaceId,
        transcriptVersion: params.transcriptVersion,
        documentId: params.documentId,
        kind: seed.kind,
        targetApp: seed.targetApp,
        title: seed.title.slice(0, 300),
        payload: seed.payload as never,
        reason: seed.reason,
        evidence: seed.evidence as never,
        confidence: seed.confidence,
        commitment: seed.commitment,
        riskLevel: seed.riskLevel,
        validation: validation as never,
        duplicateCheck: duplicateCheck as never,
        idempotencyKey,
      });
      // undefined = idempotency-key conflict (same proposal already exists
      // from a previous analysis run) — correct no-op.
      if (row) created.push(row);
    }
    return created;
  }

  private async validateSeed(seed: ProposalSeed): Promise<ProposalValidation> {
    const warnings: string[] = [];
    const missingFields: string[] = [];

    if (!EXECUTABLE_TARGETS.has(seed.targetApp)) {
      warnings.push(
        `${seed.targetApp} is not connected — this proposal is recorded but cannot be executed yet`,
      );
    }
    switch (seed.kind) {
      case 'create_work_item':
        if (!this.planeClient.isEnabled()) {
          warnings.push('ConqrPlane integration is not configured');
        }
        if (!seed.payload.projectId) missingFields.push('projectId');
        break;
      case 'create_page':
      case 'create_decision_record':
        if (!seed.payload.spaceId) missingFields.push('spaceId');
        break;
      default:
        break;
    }
    return { warnings, missingFields };
  }

  private async duplicateCheck(seed: ProposalSeed): Promise<{
    searched: boolean;
    candidates: { id: string; title: string; url?: string }[];
  }> {
    if (
      seed.kind === 'create_work_item' &&
      seed.payload.projectId &&
      this.planeClient.isEnabled()
    ) {
      try {
        const { results } = await this.planeClient.listWorkItems(
          String(seed.payload.projectId),
          { search: seed.title.slice(0, 80), perPage: 5 },
        );
        return {
          searched: true,
          candidates: results.slice(0, 5).map((r: any) => ({
            id: r.id,
            title: r.name ?? '',
          })),
        };
      } catch (err) {
        this.logger.warn(
          `Duplicate check failed for "${seed.title}": ${(err as Error).message}`,
        );
        return { searched: false, candidates: [] };
      }
    }
    return { searched: false, candidates: [] };
  }

  private idempotencyKey(meetingId: string, seed: ProposalSeed): string {
    const fingerprint = JSON.stringify({
      kind: seed.kind,
      target: seed.targetApp,
      title: seed.title.toLowerCase().trim(),
    });
    return createHash('sha256')
      .update(`${meetingId}:${fingerprint}`)
      .digest('hex');
  }

  // ---- review actions ----

  async approve(params: {
    proposalId: string;
    workspaceId: string;
    user: User;
    editedPayload?: Record<string, unknown>;
    confirmRisk?: boolean;
  }): Promise<MeetingActionProposal> {
    const proposal = await this.repo.findProposal(
      params.proposalId,
      params.workspaceId,
    );
    if (!proposal) throw new NotFoundException('Proposal not found');

    if (!EXECUTABLE_TARGETS.has(proposal.targetApp)) {
      throw new UnprocessableEntityException(
        `${proposal.targetApp} is not connected; this proposal cannot be executed`,
      );
    }
    if (proposal.riskLevel === 'risky' && !params.confirmRisk) {
      throw new UnprocessableEntityException(
        'This is a risky action and requires explicit confirmation (confirmRisk: true)',
      );
    }

    const effectivePayload = {
      ...(proposal.payload as Record<string, unknown>),
      ...(params.editedPayload ?? {}),
    };
    const stillMissing = (
      ((proposal.validation as unknown as ProposalValidation | null)
        ?.missingFields) ?? []
    ).filter((f) => effectivePayload[f] === undefined || effectivePayload[f] === null || effectivePayload[f] === '');
    if (stillMissing.length > 0) {
      throw new UnprocessableEntityException(
        `Missing required fields: ${stillMissing.join(', ')}`,
      );
    }

    const updated = await this.repo.transitionProposal(
      params.proposalId,
      params.workspaceId,
      ['proposed', 'draft', 'failed'],
      'approved',
      {
        decidedBy: params.user.id,
        decidedAt: new Date(),
        editedPayload: params.editedPayload
          ? (params.editedPayload as never)
          : proposal.editedPayload,
      },
    );
    if (!updated) {
      throw new ConflictException(
        `Proposal is not approvable (status: ${proposal.status})`,
      );
    }
    return updated;
  }

  async reject(
    proposalId: string,
    workspaceId: string,
    user: User,
  ): Promise<MeetingActionProposal> {
    const updated = await this.repo.transitionProposal(
      proposalId,
      workspaceId,
      ['proposed', 'draft', 'failed'],
      'rejected',
      { decidedBy: user.id, decidedAt: new Date() },
    );
    if (!updated) {
      throw new ConflictException('Proposal is not in a rejectable state');
    }
    return updated;
  }

  /** Bulk-approve safe proposals; risky and incomplete ones are skipped (D10). */
  async approveSafe(
    meetingId: string,
    workspaceId: string,
    user: User,
  ): Promise<{ approved: string[]; skipped: { id: string; reason: string }[] }> {
    const proposals = await this.repo.listProposals(meetingId, workspaceId);
    const approved: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const p of proposals) {
      if (p.status !== 'proposed') continue;
      if (p.riskLevel !== 'safe') {
        skipped.push({ id: p.id, reason: `risk level is ${p.riskLevel}` });
        continue;
      }
      try {
        await this.approve({
          proposalId: p.id,
          workspaceId,
          user,
        });
        approved.push(p.id);
      } catch (err) {
        skipped.push({ id: p.id, reason: (err as Error).message });
      }
    }
    return { approved, skipped };
  }

  // ---- execution (queue worker calls this) ----

  async execute(params: {
    proposalId: string;
    workspaceId: string;
    actorId: string;
  }): Promise<MeetingActionProposal> {
    const claimed = await this.repo.transitionProposal(
      params.proposalId,
      params.workspaceId,
      'approved',
      'executing',
    );
    if (!claimed) {
      // Already executing/executed (duplicate job) — return current state.
      const current = await this.repo.findProposal(
        params.proposalId,
        params.workspaceId,
      );
      if (!current) throw new NotFoundException('Proposal not found');
      return current;
    }

    const payload = {
      ...(claimed.payload as Record<string, unknown>),
      ...((claimed.editedPayload as Record<string, unknown> | null) ?? {}),
    };

    try {
      const result = await this.runExecutor(claimed, payload, params.actorId);
      const executed = await this.repo.transitionProposal(
        params.proposalId,
        params.workspaceId,
        'executing',
        'executed',
        {
          executionResult: {
            ...result,
            executedAt: new Date().toISOString(),
          } as never,
        },
      );
      return executed ?? claimed;
    } catch (err) {
      this.logger.warn(
        `Proposal ${params.proposalId} execution failed: ${(err as Error).message}`,
      );
      const failed = await this.repo.transitionProposal(
        params.proposalId,
        params.workspaceId,
        'executing',
        'failed',
        {
          executionResult: {
            error: (err as Error).message.slice(0, 1000),
            failedAt: new Date().toISOString(),
          } as never,
        },
      );
      return failed ?? claimed;
    }
  }

  private async runExecutor(
    proposal: MeetingActionProposal,
    payload: Record<string, unknown>,
    actorId: string,
  ): Promise<Record<string, unknown>> {
    switch (proposal.kind) {
      case 'create_work_item': {
        if (!this.planeClient.isEnabled()) {
          throw new Error('ConqrPlane integration is not configured');
        }
        const projectId = String(payload.projectId);
        const description = [
          String(payload.description ?? ''),
          '',
          `_Created from meeting via Conqr AI (meeting ${proposal.meetingId})._`,
        ]
          .join('\n')
          .trim();
        const workItem = await this.planeClient.createWorkItem(projectId, {
          name: String(payload.name ?? proposal.title),
          description_html: `<p>${escapeHtml(description).replace(/\n/g, '<br/>')}</p>`,
          priority: normalizePriority(payload.priority),
        });
        return {
          entityId: (workItem as any).id,
          entityType: 'plane_work_item',
          projectId,
        };
      }
      case 'create_page':
      case 'create_decision_record': {
        const spaceId = String(payload.spaceId);
        const page = await this.createPageChecked({
          actorId,
          workspaceId: proposal.workspaceId,
          spaceId,
          title: String(payload.title ?? proposal.title),
          markdown: this.decisionMarkdown(proposal, payload),
        });
        return { entityId: page.id, entityType: 'hub_page', spaceId };
      }
      case 'draft_followup_email': {
        // Safe by construction: the draft is stored as content, never sent.
        return {
          entityType: 'stored_draft',
          note: 'Draft stored on the meeting; sending email is not automated',
        };
      }
      default:
        throw new Error(
          `No executor for proposal kind "${proposal.kind}" (target ${proposal.targetApp})`,
        );
    }
  }

  private async createPageChecked(params: {
    actorId: string;
    workspaceId: string;
    spaceId: string;
    title: string;
    markdown: string;
  }): Promise<{ id: string }> {
    const ability = await this.spaceAbility.createForUser(
      { id: params.actorId } as User,
      params.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException(
        'Approving user cannot create pages in the target space',
      );
    }
    return this.pageService.create(params.actorId, params.workspaceId, {
      spaceId: params.spaceId,
      title: params.title,
      content: params.markdown,
      format: 'markdown',
    } as never) as Promise<{ id: string }>;
  }

  private decisionMarkdown(
    proposal: MeetingActionProposal,
    payload: Record<string, unknown>,
  ): string {
    const evidence = (proposal.evidence as { quote: string }[] | null) ?? [];
    return [
      `# ${payload.title ?? proposal.title}`,
      '',
      String(payload.detail ?? ''),
      '',
      `**Status:** ${payload.decisionKind ?? 'recorded'}`,
      '',
      evidence.length
        ? `**Evidence from the meeting:**\n${evidence.map((e) => `> ${e.quote}`).join('\n')}`
        : '',
      '',
      `_Recorded from meeting ${proposal.meetingId} via Conqr AI._`,
    ]
      .join('\n')
      .trim();
  }
}

function normalizePriority(p: unknown): string {
  const v = String(p ?? '').toLowerCase();
  return ['urgent', 'high', 'medium', 'low', 'none'].includes(v) ? v : 'none';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
