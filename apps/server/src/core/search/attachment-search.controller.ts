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
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { SearchDTO } from './dto/search.dto';
import { AttachmentSearchService } from './attachment-search.service';

/** Search in the files attached to pages (the "Files" filter of the search). */
@UseGuards(JwtAuthGuard)
@Controller('search-attachments')
export class AttachmentSearchController {
  constructor(
    private readonly attachmentSearch: AttachmentSearchService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async search(
    @Body() dto: SearchDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.spaceId) {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    return this.attachmentSearch.search(
      {
        query: dto.query,
        spaceId: dto.spaceId,
        limit: dto.limit,
        offset: dto.offset,
      },
      { userId: user.id, workspaceId: workspace.id },
    );
  }
}
