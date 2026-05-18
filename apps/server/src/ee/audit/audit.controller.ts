import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { AuditService } from './audit.service';
import { AuditLogsListDto, AuditRetentionDto } from './dto/audit.dto';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async getLogs(
    @Body() dto: AuditLogsListDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }
    return this.auditService.getLogs(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention')
  async getRetention(
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }
    return this.auditService.getRetention(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retention/update')
  async updateRetention(
    @Body() dto: AuditRetentionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Audit)) {
      throw new ForbiddenException();
    }
    await this.auditService.updateRetention(workspace.id, dto.auditRetentionDays);
    return this.auditService.getRetention(workspace.id);
  }
}
