import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SUITE_DELEGATED_SCOPES } from '../domain/suite-delegation-scope';
import {
  Delegation,
  RequiresDelegationScope,
  SuiteDelegationGuard,
} from './suite-delegation.guard';
import type { DelegationContext } from '../services/suite-delegation-verifier.service';
import {
  DELEGATED_AUTHORING,
  type DelegatedAuthoringPort,
} from './delegated-authoring.port';
import {
  CommentCreateDto,
  CommentListDto,
  CommentUpdateDto,
  PageCreateDto,
  PageHistoryDto,
  PageIdDto,
  PageListDto,
  PageRecentDto,
  PageSearchDto,
  PageUpdateDto,
  SpaceCreateDto,
  SpaceListDto,
  SpaceReadDto,
  SpaceUpdateDto,
} from './dto/delegated-authoring.dto';

/**
 * The delegated surface, which today is one route.
 *
 * `whoami` exists because the identity chain is the part of this design most
 * likely to be misconfigured — a mismatched `idp_key`, a missing
 * `suite_org_identity` row, an `auth_accounts` link that was never written —
 * and every one of those produces the same uniform 401 from any real endpoint.
 * A route whose whole job is to say who Hub thinks the caller is turns an
 * afternoon of guessing into one request.
 *
 * It is not a free pass: it is guarded exactly like any other delegated route
 * and needs a scope, so being able to call it already means being able to read
 * something. It returns the resolved identity and nothing about the assertion
 * that could be replayed.
 */
@Controller('delegation')
export class SuiteDelegationController {
  constructor(
    @Inject(DELEGATED_AUTHORING)
    private readonly authoring: DelegatedAuthoringPort,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Get('whoami')
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.spaceRead)
  whoami(@Delegation() delegation: DelegationContext) {
    return {
      user: {
        id: delegation.user.id,
        name: delegation.user.name,
        email: delegation.user.email,
      },
      workspace: {
        id: delegation.workspace.id,
        name: delegation.workspace.name,
      },
      identity: {
        idpKey: delegation.idpKey,
        subject: delegation.subject,
        externalOrgId: delegation.externalOrgId,
        personUid: delegation.personUid,
        orgUid: delegation.orgUid,
      },
      scope: delegation.scope,
    };
  }

  @Post('spaces/list')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.spaceRead)
  listSpaces(@Delegation() ctx: DelegationContext, @Body() dto: SpaceListDto) {
    return this.authoring.listSpaces(ctx, dto.limit);
  }

  @Post('spaces/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.spaceRead)
  readSpace(@Delegation() ctx: DelegationContext, @Body() dto: SpaceReadDto) {
    return this.authoring.readSpace(ctx, dto.space_id);
  }

  @Post('spaces/create')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.spaceCreate)
  createSpace(
    @Delegation() ctx: DelegationContext,
    @Body() dto: SpaceCreateDto,
  ) {
    return this.authoring.createSpace(ctx, dto);
  }

  @Post('spaces/update')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.spaceUpdate)
  updateSpace(
    @Delegation() ctx: DelegationContext,
    @Body() dto: SpaceUpdateDto,
  ) {
    return this.authoring.updateSpace(ctx, dto);
  }

  @Post('pages/search')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageSearch)
  searchPages(
    @Delegation() ctx: DelegationContext,
    @Body() dto: PageSearchDto,
  ) {
    return this.authoring.searchPages(ctx, dto.query, dto.limit);
  }

  @Post('pages/list')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageRead)
  listPages(@Delegation() ctx: DelegationContext, @Body() dto: PageListDto) {
    return this.authoring.listPages(
      ctx,
      dto.space_id,
      dto.parent_page_id,
      dto.limit,
    );
  }

  @Post('pages/recent')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageRead)
  recentPages(
    @Delegation() ctx: DelegationContext,
    @Body() dto: PageRecentDto,
  ) {
    return this.authoring.recentPages(ctx, dto.limit);
  }

  @Post('pages/read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageRead)
  readPage(@Delegation() ctx: DelegationContext, @Body() dto: PageIdDto) {
    return this.authoring.readPage(ctx, dto.page_id);
  }

  @Post('pages/breadcrumbs')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageRead)
  breadcrumbs(@Delegation() ctx: DelegationContext, @Body() dto: PageIdDto) {
    return this.authoring.breadcrumbs(ctx, dto.page_id);
  }

  @Post('pages/history')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageRead)
  history(@Delegation() ctx: DelegationContext, @Body() dto: PageHistoryDto) {
    return this.authoring.history(ctx, dto.page_id, dto.limit);
  }

  @Post('pages/create')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageCreate)
  createPage(@Delegation() ctx: DelegationContext, @Body() dto: PageCreateDto) {
    return this.authoring.createPage(ctx, dto);
  }

  @Post('pages/update')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.pageUpdate)
  updatePage(@Delegation() ctx: DelegationContext, @Body() dto: PageUpdateDto) {
    return this.authoring.updatePage(ctx, dto);
  }

  @Post('comments/list')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.commentRead)
  listComments(
    @Delegation() ctx: DelegationContext,
    @Body() dto: CommentListDto,
  ) {
    return this.authoring.listComments(ctx, dto.page_id, dto.limit);
  }

  @Post('comments/create')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.commentCreate)
  createComment(
    @Delegation() ctx: DelegationContext,
    @Body() dto: CommentCreateDto,
  ) {
    return this.authoring.createComment(ctx, dto.page_id, dto.text);
  }

  @Post('comments/update')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SuiteDelegationGuard)
  @RequiresDelegationScope(SUITE_DELEGATED_SCOPES.commentUpdate)
  updateComment(
    @Delegation() ctx: DelegationContext,
    @Body() dto: CommentUpdateDto,
  ) {
    return this.authoring.updateComment(ctx, dto.comment_id, dto.text);
  }
}
