import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { DocHealthService } from './services/doc-health.service';
import { HealthIssuesService } from './services/issues.service';
import { HealthSnapshotService } from './services/snapshot.service';
import {
  AlertSubscription,
  HealthAlertsService,
} from './services/alerts.service';
import { KnowledgeGapsService } from './services/knowledge-gaps.service';
import { SearchAnalyticsService } from '../search/search-analytics.service';
import {
  HealthAlertItem,
  HealthAlertSubscribeDto,
  HealthAlertUnsubscribeDto,
  HealthIssuesQueryDto,
  HealthTrendQueryDto,
  HealthTrendResponse,
  KnowledgeGapsQueryDto,
  KnowledgeGapsResponse,
  SearchGapsQueryDto,
  SearchGapsResponse,
  SpaceHealthDto,
} from './dto/doc-health.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspace-health')
export class DocHealthController {
  constructor(
    private readonly docHealth: DocHealthService,
    private readonly issues: HealthIssuesService,
    private readonly snapshots: HealthSnapshotService,
    private readonly alerts: HealthAlertsService,
    private readonly gaps: KnowledgeGapsService,
    private readonly searchAnalytics: SearchAnalyticsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async getWorkspaceHealth(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.docHealth.getWorkspaceHealth(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/space')
  async getSpaceHealth(
    @Body() input: SpaceHealthDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const space = await this.spaceRepo.findById(input.spaceId, workspace.id);
    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const workspaceAbility = this.workspaceAbility.createForUser(
      user,
      workspace,
    );
    if (
      workspaceAbility.cannot(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Settings,
      )
    ) {
      const spaceAbility = await this.spaceAbility.createForUser(
        user,
        space.id,
      );
      if (
        spaceAbility.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)
      ) {
        throw new ForbiddenException();
      }
    }

    return this.docHealth.getSpaceHealth(workspace.id, space.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/issues')
  async getIssues(
    @Body() input: HealthIssuesQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    const isWorkspaceAdmin = ability.can(
      WorkspaceCaslAction.Manage,
      WorkspaceCaslSubject.Settings,
    );

    if (input.spaceId) {
      const space = await this.spaceRepo.findById(input.spaceId, workspace.id);
      if (!space) {
        throw new NotFoundException('Space not found');
      }
      if (!isWorkspaceAdmin) {
        const spaceAbility = await this.spaceAbility.createForUser(
          user,
          space.id,
        );
        if (
          spaceAbility.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)
        ) {
          throw new ForbiddenException();
        }
      }
    } else if (!isWorkspaceAdmin) {
      throw new ForbiddenException();
    }

    return this.issues.listIssues({
      workspaceId: workspace.id,
      category: input.category,
      spaceId: input.spaceId,
      page: input.page ?? 1,
      limit: input.limit ?? 25,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/trend')
  async getTrend(
    @Body() input: HealthTrendQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<HealthTrendResponse> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    const isWorkspaceAdmin = ability.can(
      WorkspaceCaslAction.Manage,
      WorkspaceCaslSubject.Settings,
    );

    if (input.spaceId) {
      const space = await this.spaceRepo.findById(input.spaceId, workspace.id);
      if (!space) {
        throw new NotFoundException('Space not found');
      }
      if (!isWorkspaceAdmin) {
        const spaceAbility = await this.spaceAbility.createForUser(
          user,
          space.id,
        );
        if (
          spaceAbility.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)
        ) {
          throw new ForbiddenException();
        }
      }
    } else if (!isWorkspaceAdmin) {
      throw new ForbiddenException();
    }

    const points = await this.snapshots.getTrend({
      workspaceId: workspace.id,
      spaceId: input.spaceId ?? null,
      days: input.days ?? 30,
    });

    return { points };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/issues/export')
  async exportIssues(
    @Body() input: HealthIssuesQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() reply: FastifyReply,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    const isWorkspaceAdmin = ability.can(
      WorkspaceCaslAction.Manage,
      WorkspaceCaslSubject.Settings,
    );

    if (input.spaceId) {
      const space = await this.spaceRepo.findById(input.spaceId, workspace.id);
      if (!space) {
        throw new NotFoundException('Space not found');
      }
      if (!isWorkspaceAdmin) {
        const spaceAbility = await this.spaceAbility.createForUser(
          user,
          space.id,
        );
        if (
          spaceAbility.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)
        ) {
          throw new ForbiddenException();
        }
      }
    } else if (!isWorkspaceAdmin) {
      throw new ForbiddenException();
    }

    const csv = await this.issues.exportCsv({
      workspaceId: workspace.id,
      category: input.category,
      spaceId: input.spaceId,
    });

    const ts = new Date().toISOString().slice(0, 10);
    const filename = `doc-health-${input.category}-${ts}.csv`;
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(csv);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/gaps')
  async getKnowledgeGaps(
    @Body() input: KnowledgeGapsQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<KnowledgeGapsResponse> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.gaps.findGaps({
      workspaceId: workspace.id,
      days: input.days,
      minOccurrences: input.minOccurrences,
      limit: input.limit,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/search-gaps')
  async getSearchGaps(
    @Body() input: SearchGapsQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<SearchGapsResponse> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.searchAnalytics.findFailedQueries({
      workspaceId: workspace.id,
      days: input.days,
      minOccurrences: input.minOccurrences,
      limit: input.limit,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('/snapshot')
  async captureSnapshot(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ capturedAt: string; alertsFired: number }> {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    const now = new Date();
    await this.snapshots.captureWorkspace(workspace.id, now);
    const result = await this.alerts.evaluateForWorkspace(workspace.id, now);
    return { capturedAt: now.toISOString(), alertsFired: result.fired };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/alerts')
  async listAlerts(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ items: HealthAlertItem[] }> {
    const subs = await this.alerts.listForUser(user.id, workspace.id);
    return { items: subs.map(toAlertItem) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('/alerts/subscribe')
  async subscribeAlert(
    @Body() input: HealthAlertSubscribeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<HealthAlertItem> {
    const sub = await this.alerts.subscribe({
      userId: user.id,
      workspaceId: workspace.id,
      spaceId: input.spaceId ?? null,
      threshold: input.threshold,
    });
    return toAlertItem(sub);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/alerts/unsubscribe')
  async unsubscribeAlert(
    @Body() input: HealthAlertUnsubscribeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ ok: true }> {
    await this.alerts.unsubscribe({
      userId: user.id,
      workspaceId: workspace.id,
      subscriptionId: input.subscriptionId,
    });
    return { ok: true };
  }
}

function toAlertItem(sub: AlertSubscription): HealthAlertItem {
  return {
    id: sub.id,
    spaceId: sub.spaceId,
    threshold: sub.threshold,
    lastFiredAt: sub.lastFiredAt ? sub.lastFiredAt.toISOString() : null,
    createdAt: sub.createdAt.toISOString(),
  };
}
