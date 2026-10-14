import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { MeetingTemplateService } from './meeting-template.service';
import { CreateTemplateDto, SetDefaultTemplateDto, UpdateTemplateDto } from './dto/meeting-template.dto';
import { isWorkspaceManager, type MeetingActor } from './meeting-access.util';

function actor(user: User, workspace: Workspace): MeetingActor {
  return { id: user.id, role: user.role, workspaceId: workspace.id };
}

/** Meeting templates ("Modèles de réunion"): the builder's API. Its own
 *  path so `:id` routes of /ai/meeting never swallow "templates". */
@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('stt')
@Controller('ai/meeting-templates')
export class MeetingTemplateController {
  constructor(private readonly templates: MeetingTemplateService) {}

  @HttpCode(HttpStatus.OK)
  @Get()
  async list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    const a = actor(user, workspace);
    return {
      items: await this.templates.list(workspace.id, a),
      // Additive: the company default of a meeting type is an Owner/Admin choice.
      canManageDefaults: isWorkspaceManager(a),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Get(':id')
  async get(@Param('id') id: string, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.templates.withAccess(await this.templates.get(workspace.id, id), actor(user, workspace));
  }

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Body() dto: CreateTemplateDto, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.templates.withAccess(await this.templates.create(workspace.id, user.id, dto), actor(user, workspace));
  }

  @HttpCode(HttpStatus.OK)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const a = actor(user, workspace);
    return this.templates.withAccess(await this.templates.update(workspace.id, user.id, id, dto, a), a);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  async publish(@Param('id') id: string, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    const a = actor(user, workspace);
    return this.templates.withAccess(await this.templates.publish(workspace.id, user.id, id, a), a);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/default')
  async setDefault(
    @Param('id') id: string,
    @Body() dto: SetDefaultTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const a = actor(user, workspace);
    return this.templates.withAccess(await this.templates.setDefault(workspace.id, user.id, id, dto.isDefault !== false, a), a);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async remove(@Param('id') id: string, @AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    await this.templates.remove(workspace.id, id, actor(user, workspace));
  }
}
