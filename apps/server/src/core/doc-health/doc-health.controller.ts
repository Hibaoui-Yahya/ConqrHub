import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
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
import {
  HealthIssuesQueryDto,
  SpaceHealthDto,
} from './dto/doc-health.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspace-health')
export class DocHealthController {
  constructor(
    private readonly docHealth: DocHealthService,
    private readonly issues: HealthIssuesService,
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
}
