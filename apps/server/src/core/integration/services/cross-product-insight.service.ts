import { Injectable } from '@nestjs/common';
import { RequirementService } from './requirement.service';

export interface GroundedSource {
  urn?: string;
  kind: string;
  detail: string;
}

export interface StatusUpdate {
  draftMarkdown: string;
  sources: GroundedSource[];
  /** Fact vs suggestion is kept explicit (blueprint §6.5). */
  disclaimer: string;
}

/**
 * Permission-aware cross-product insight (blueprint §6.5).
 *
 * Produces a status update GROUNDED in real state — requirement coverage gaps
 * over the typed graph — and cites its sources. This is the deterministic core;
 * `groundedContext()` is the seam an LLM can consume to phrase the summary,
 * while facts remain verifiable and distinct from suggestions. It never invents
 * data and only reads what the caller's workspace already exposes.
 */
@Injectable()
export class CrossProductInsightService {
  constructor(private readonly requirements: RequirementService) {}

  /** Structured facts an LLM (or a template) can turn into prose. */
  async groundedContext(
    workspaceId: string,
    viewerId: string,
    planeProjectId?: string,
  ) {
    const coverage = await this.requirements.coverageGaps(
      workspaceId,
      viewerId,
      planeProjectId,
    );
    const noWork = coverage.gaps.filter((g) => g.reason === 'no_delivery_work');
    const incomplete = coverage.gaps.filter((g) => g.reason === 'incomplete');
    const covered = coverage.total - coverage.gaps.length;
    return { coverage, noWork, incomplete, covered };
  }

  async statusUpdate(
    workspaceId: string,
    viewerId: string,
    planeProjectId?: string,
  ): Promise<StatusUpdate> {
    const { coverage, noWork, incomplete, covered } =
      await this.groundedContext(workspaceId, viewerId, planeProjectId);

    const pct =
      coverage.total > 0 ? Math.round((covered / coverage.total) * 100) : null;

    const lines: string[] = [];
    lines.push('## Delivery status');
    lines.push('');
    lines.push(
      coverage.total === 0
        ? '- No approved requirements are being tracked yet.'
        : `- **${covered}/${coverage.total}** approved requirements fully delivered${pct !== null ? ` (${pct}%)` : ''}.`,
    );
    if (noWork.length) {
      lines.push(`- ⚠️ **${noWork.length}** approved requirement(s) have no delivery work:`);
      noWork.slice(0, 10).forEach((g) =>
        lines.push(`  - ${g.title ?? g.blockId} _(${g.state})_`),
      );
    }
    if (incomplete.length) {
      lines.push(`- ⏳ **${incomplete.length}** requirement(s) partially delivered:`);
      incomplete.slice(0, 10).forEach((g) =>
        lines.push(
          `  - ${g.title ?? g.blockId} — ${Math.round((g.coverage ?? 0) * 100)}% complete`,
        ),
      );
    }
    if (!noWork.length && !incomplete.length && coverage.total > 0) {
      lines.push('- ✅ All approved requirements have complete delivery work.');
    }

    const sources: GroundedSource[] = coverage.gaps.map((g) => ({
      kind: 'requirement',
      detail: `${g.title ?? g.blockId} (${g.reason})`,
    }));

    return {
      draftMarkdown: lines.join('\n'),
      sources,
      disclaimer:
        'Facts are computed from linked requirements and delivery work; review before sharing. Wording is a draft, not a decision.',
    };
  }
}
