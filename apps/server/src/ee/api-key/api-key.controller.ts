import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { ApiKeyService } from './api-key.service';
import { ApiKeyRepo } from './api-key.repo';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';

class ListApiKeysDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  adminView?: boolean;

  @IsOptional()
  @IsUUID()
  creatorId?: string;
}

class CreateApiKeyDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsString()
  @MaxLength(100)
  name: string;
}

class RevokeApiKeyDto {
  @IsUUID()
  apiKeyId: string;
}

@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name);

  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly apiKeyRepo: ApiKeyRepo,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private async assertCanManageOrOwn(
    apiKeyId: string,
    user: User,
    workspace: Workspace,
  ) {
    const apiKey = await this.apiKeyRepo.findById(apiKeyId, workspace.id);
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    if (apiKey.creatorId === user.id) {
      return apiKey;
    }
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)) {
      throw new ForbiddenException(
        'You can only manage API keys that you created',
      );
    }
    return apiKey;
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async list(
    @Body() dto: ListApiKeysDto,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    if (dto.adminView) {
      const ability = this.workspaceAbility.createForUser(user, workspace);
      if (
        ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.API)
      ) {
        throw new ForbiddenException();
      }
    }

    const items = await this.apiKeyService.list({
      workspaceId: workspace.id,
      cursor: dto.cursor,
      limit: 20,
      creatorId: dto.adminView ? dto.creatorId : user.id,
    });

    return {
      items,
      nextCursor: items.length === 20 ? items[items.length - 1]?.id : null,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { apiKey, token } = await this.apiKeyService.create({
      name: dto.name,
      userId: user.id,
      workspaceId: workspace.id,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });

    return {
      id: apiKey.id,
      name: (apiKey as any).name,
      token,
      expiresAt: (apiKey as any).expiresAt,
      createdAt: (apiKey as any).createdAt,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanManageOrOwn(dto.apiKeyId, user, workspace);
    await this.apiKeyService.update(dto.apiKeyId, workspace.id, dto.name);
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revoke(
    @Body() dto: RevokeApiKeyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanManageOrOwn(dto.apiKeyId, user, workspace);
    await this.apiKeyService.revoke(dto.apiKeyId, workspace.id);
  }
}
