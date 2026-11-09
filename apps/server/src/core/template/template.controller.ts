import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';
import { TemplateService } from './template.service';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  TemplateIdDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplateController {
  constructor(
    private readonly templateService: TemplateService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  list(
    @Body() dto: ListTemplatesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.list(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.get(dto.templateId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(
    @Body() dto: CreateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @Body() dto: UpdateTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.templateService.update(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() dto: TemplateIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.templateService.delete(dto.templateId, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('use')
  async use(
    @Body() dto: UseTemplateDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.templateService.use(dto, user, workspace);

    this.auditService.log({
      event: AuditEvent.PAGE_CREATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: {
          title: getPageTitle(page.title),
          spaceId: page.spaceId,
        },
      },
      metadata: { templateId: dto.templateId },
    });

    return page;
  }
}
