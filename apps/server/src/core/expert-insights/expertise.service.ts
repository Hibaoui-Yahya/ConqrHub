import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { User } from '@docmost/db/types/entity.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { ExpertInsightsRepo } from './expert-insights.repo';
import { ExpertiseRepo } from './expertise.repo';
import {
  InsightVotesDto,
  SearchInsightsDto,
  VoteInsightDto,
} from './dto/expertise.dto';

/**
 * The workspace-wide "Expertise" directory and the helpful / not helpful
 * votes. Every answer is limited to insights of pages the reader can open
 * now (space membership, then the page's own restrictions).
 */
@Injectable()
export class ExpertiseService {
  constructor(
    private readonly insightsRepo: ExpertInsightsRepo,
    private readonly expertiseRepo: ExpertiseRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  private async openPageIds(userId: string, pageIds: string[]) {
    if (pageIds.length === 0) return new Set<string>();
    return new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: [...new Set(pageIds)],
        userId,
      }),
    );
  }

  async search(dto: SearchInsightsDto, user: User) {
    let spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
    if (dto.spaceId) {
      if (!spaceIds.includes(dto.spaceId)) throw new ForbiddenException();
      spaceIds = [dto.spaceId];
    }

    const manageable: string[] = [];
    for (const spaceId of spaceIds) {
      const ability = await this.spaceAbility
        .createForUser(user, spaceId)
        .catch(() => null);
      if (ability?.can(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
        manageable.push(spaceId);
      }
    }

    const limit = Math.min(Math.max(dto.limit ?? 50, 1), 100);
    const rows = await this.expertiseRepo.search({
      workspaceId: user.workspaceId,
      spaceIds,
      manageableSpaceIds: manageable,
      status: dto.status,
      query: dto.query,
      // Read more than shown: some may sit on pages the reader cannot open.
      limit: limit * 2,
    });

    const open = await this.openPageIds(
      user.id,
      rows.map((r) => r.pageId),
    );
    const visible = rows.filter((r) => open.has(r.pageId)).slice(0, limit);
    const votes = await this.expertiseRepo.findVotes(
      user.id,
      visible.map((r) => r.id),
    );
    const manageableSet = new Set(manageable);

    return {
      items: visible.map((r) => ({
        ...r,
        myVote: votes[r.id] ?? null,
        canManage: manageableSet.has(r.spaceId),
      })),
    };
  }

  /** Answers 404 unless the reader can open the page now. */
  async assertCanOpenPage(pageId: string, user: User) {
    const open = await this.openPageIds(user.id, [pageId]);
    if (!open.has(pageId)) throw new NotFoundException('Page not found');
  }

  /** The reader's own votes for a set of insights (page panel). */
  async myVotes(dto: InsightVotesDto, user: User) {
    return this.expertiseRepo.findVotes(user.id, dto.insightIds);
  }

  async vote(dto: VoteInsightDto, user: User) {
    const insight = await this.insightsRepo.findById(
      dto.insightId,
      user.workspaceId,
    );
    if (!insight) throw new NotFoundException('Insight not found');

    const ability = await this.spaceAbility
      .createForUser(user, insight.spaceId)
      .catch(() => null);
    if (!ability || ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Insight)) {
      throw new NotFoundException('Insight not found');
    }
    const open = await this.openPageIds(user.id, [insight.pageId]);
    if (!open.has(insight.pageId)) {
      throw new NotFoundException('Insight not found');
    }

    if (insight.status !== 'published') {
      throw new BadRequestException('Only published insights can be rated');
    }

    const counts = await this.expertiseRepo.setVote(
      insight.id,
      user.id,
      dto.vote ?? null,
    );
    return { insightId: insight.id, myVote: dto.vote ?? null, ...counts };
  }
}
