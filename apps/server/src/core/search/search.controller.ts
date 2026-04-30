import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SearchService } from './search.service';
import {
  SearchClickDTO,
  SearchDTO,
  SearchShareDTO,
  SearchSuggestionDTO,
} from './dto/search.dto';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { ModuleRef } from '@nestjs/core';
import { SearchAnalyticsService } from './search-analytics.service';

function countResults(results: unknown): number {
  if (Array.isArray(results)) return results.length;
  if (
    results &&
    typeof results === 'object' &&
    'items' in results &&
    Array.isArray((results as { items: unknown[] }).items)
  ) {
    return (results as { items: unknown[] }).items.length;
  }
  return 0;
}

@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(
    private readonly searchService: SearchService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly environmentService: EnvironmentService,
    private readonly analytics: SearchAnalyticsService,
    private moduleRef: ModuleRef,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async pageSearch(
    @Body() searchDto: SearchDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    delete searchDto.shareId;

    if (searchDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        searchDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const results =
      this.environmentService.getSearchDriver() === 'typesense'
        ? await this.searchTypesense(searchDto, {
            userId: user.id,
            workspaceId: workspace.id,
          })
        : await this.searchService.searchPage(searchDto, {
            userId: user.id,
            workspaceId: workspace.id,
          });

    // Await the analytics write so the query row is durable before the
    // client receives results — otherwise a fast click could land its
    // event in the DB before the corresponding query event, breaking the
    // success-ratio match that joins click → query by timestamp window.
    // logQuery already swallows DB errors, so it can't fail the search.
    await this.analytics.logQuery({
      workspaceId: workspace.id,
      userId: user.id,
      query: searchDto.query,
      resultCount: countResults(results),
    });

    return results;
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('click')
  async trackClick(
    @Body() dto: SearchClickDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<void> {
    await this.analytics.logClick({
      workspaceId: workspace.id,
      userId: user.id,
      query: dto.query,
      pageId: dto.pageId,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('suggest')
  async searchSuggestions(
    @Body() dto: SearchSuggestionDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.searchService.searchSuggestions(dto, user.id, workspace.id);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('share-search')
  async searchShare(
    @Body() searchDto: SearchShareDTO,
    @AuthWorkspace() workspace: Workspace,
  ) {
    delete searchDto.spaceId;
    if (!searchDto.shareId) {
      throw new BadRequestException('shareId is required');
    }

    if (this.environmentService.getSearchDriver() === 'typesense') {
      return this.searchTypesense(searchDto, {
        workspaceId: workspace.id,
      });
    }

    return this.searchService.searchPage(searchDto, {
      workspaceId: workspace.id,
    });
  }

  async searchTypesense(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
    },
  ) {
    const { userId, workspaceId } = opts;
    let TypesenseModule: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      TypesenseModule = require('./../../ee/typesense/services/page-search.service');

      const PageSearchService = this.moduleRef.get(
        TypesenseModule.PageSearchService,
        {
          strict: false,
        },
      );

      return PageSearchService.searchPage(searchParams, {
        userId: userId,
        workspaceId,
      });
    } catch (err) {
      this.logger.debug(
        'Typesense module requested but enterprise module not bundled in this build',
      );
    }

    throw new BadRequestException('Enterprise Typesense search module missing');
  }
}
