import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '@docmost/db/types/entity.types';
import { ExpertInsightsRepo } from './expert-insights.repo';
import { CreateInsightDto } from './dto/create-insight.dto';
import { InsightIdDto, UpdateInsightDto } from './dto/update-insight.dto';
import { QueryInsightsDto } from './dto/query-insights.dto';
import { EventName } from '../../common/events/event.contants';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { ExpertInsightStatus } from '../../database/types/expert-insights.types';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class ExpertInsightsService {
  constructor(
    private readonly repo: ExpertInsightsRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly eventEmitter: EventEmitter2,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async create(dto: CreateInsightDto, user: User) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
      throw new ForbiddenException('You cannot create insights in this space');
    }

    const profile = await (this.db as any)
      .selectFrom('users')
      .select(['name', 'role', 'department'])
      .where('id', '=', user.id)
      .executeTakeFirst();

    const insight = await this.repo.create({
      workspaceId: user.workspaceId,
      spaceId: dto.spaceId,
      pageId: dto.pageId,
      insightType: dto.insightType,
      title: dto.title,
      body: dto.body,
      createdBy: user.id,
      authorName: profile?.name ?? null,
      authorRole: profile?.role ?? null,
      authorDepartment: profile?.department ?? null,
      confidence: dto.confidence ?? 'medium',
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      spanAnchor: dto.spanAnchor,
    });

    this.eventEmitter.emit(EventName.INSIGHT_CREATED, {
      insightId: insight.id,
      workspaceId: insight.workspaceId,
      spaceId: insight.spaceId,
    });

    return insight;
  }

  async findByPage(dto: QueryInsightsDto, user: User) {
    const insight = await this.repo
      .findByPage(dto.pageId)
      .then((rows) => rows[0]);

    if (!insight) {
      return [];
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      insight.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Insight)) {
      throw new ForbiddenException();
    }

    const canManage = ability.can(
      SpaceCaslAction.Manage,
      SpaceCaslSubject.Insight,
    );

    const status: ExpertInsightStatus | undefined = dto.status
      ? dto.status
      : canManage
        ? undefined
        : 'published';

    return this.repo.findByPage(dto.pageId, status);
  }

  async update(dto: UpdateInsightDto, user: User) {
    const existing = await this.repo.findById(dto.insightId);
    if (!existing) throw new NotFoundException('Insight not found');

    const ability = await this.spaceAbility.createForUser(
      user,
      existing.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
      throw new ForbiddenException();
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft insights can be edited');
    }

    const updated = await this.repo.update(dto.insightId, {
      insightType: dto.insightType,
      title: dto.title,
      body: dto.body,
      confidence: dto.confidence,
      expiresAt:
        'expiresAt' in dto
          ? dto.expiresAt
            ? new Date(dto.expiresAt)
            : null
          : undefined,
      spanAnchor: dto.spanAnchor,
    });

    this.eventEmitter.emit(EventName.INSIGHT_UPDATED, {
      insightId: updated.id,
      workspaceId: updated.workspaceId,
      spaceId: updated.spaceId,
    });

    return updated;
  }

  async publish(dto: InsightIdDto, user: User) {
    const existing = await this.repo.findById(dto.insightId);
    if (!existing) throw new NotFoundException('Insight not found');

    const ability = await this.spaceAbility.createForUser(
      user,
      existing.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
      throw new ForbiddenException();
    }

    if (existing.status !== 'draft') {
      throw new BadRequestException('Only draft insights can be published');
    }

    const published = await this.repo.publish(dto.insightId, user.id);

    this.eventEmitter.emit(EventName.INSIGHT_PUBLISHED, {
      insightId: published.id,
      workspaceId: published.workspaceId,
      spaceId: published.spaceId,
    });

    return published;
  }

  async retire(dto: InsightIdDto, user: User) {
    const existing = await this.repo.findById(dto.insightId);
    if (!existing) throw new NotFoundException('Insight not found');

    const ability = await this.spaceAbility.createForUser(
      user,
      existing.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
      throw new ForbiddenException();
    }

    if (existing.status !== 'published') {
      throw new BadRequestException('Only published insights can be retired');
    }

    const retired = await this.repo.retire(dto.insightId);

    this.eventEmitter.emit(EventName.INSIGHT_RETIRED, {
      insightId: retired.id,
      workspaceId: retired.workspaceId,
      spaceId: retired.spaceId,
    });

    return retired;
  }

  async delete(dto: InsightIdDto, user: User) {
    const existing = await this.repo.findById(dto.insightId);
    if (!existing) throw new NotFoundException('Insight not found');

    const ability = await this.spaceAbility.createForUser(
      user,
      existing.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Insight)) {
      throw new ForbiddenException();
    }

    await this.repo.softDelete(dto.insightId);

    this.eventEmitter.emit(EventName.INSIGHT_DELETED, {
      insightId: existing.id,
      workspaceId: existing.workspaceId,
      spaceId: existing.spaceId,
    });
  }

  async retireExpiredInsights(): Promise<string[]> {
    return this.repo.retireExpired();
  }
}
