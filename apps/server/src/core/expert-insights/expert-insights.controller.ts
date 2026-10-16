import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ExpertInsightsService } from './expert-insights.service';
import { CreateInsightDto } from './dto/create-insight.dto';
import { InsightIdDto, UpdateInsightDto } from './dto/update-insight.dto';
import { QueryInsightsDto } from './dto/query-insights.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { ExpertiseService } from './expertise.service';
import {
  InsightVotesDto,
  SearchInsightsDto,
  VoteInsightDto,
} from './dto/expertise.dto';

@UseGuards(JwtAuthGuard)
@Controller('insights')
export class ExpertInsightsController {
  constructor(
    private readonly service: ExpertInsightsService,
    private readonly expertise: ExpertiseService,
  ) {}

  /** Workspace-wide directory for the Expertise screen. */
  @HttpCode(HttpStatus.OK)
  @Post('search')
  search(@Body() dto: SearchInsightsDto, @AuthUser() user: User) {
    return this.expertise.search(dto, user);
  }

  /** Helpful / not helpful (null withdraws the vote). */
  @HttpCode(HttpStatus.OK)
  @Post('vote')
  vote(@Body() dto: VoteInsightDto, @AuthUser() user: User) {
    return this.expertise.vote(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('my-votes')
  myVotes(@Body() dto: InsightVotesDto, @AuthUser() user: User) {
    return this.expertise.myVotes(dto, user);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post('create')
  create(@Body() dto: CreateInsightDto, @AuthUser() user: User) {
    return this.service.create(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(@Body() dto: QueryInsightsDto, @AuthUser() user: User) {
    // A restricted page keeps its insights to the people who can open it.
    await this.expertise.assertCanOpenPage(dto.pageId, user);
    return this.service.findByPage(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(@Body() dto: UpdateInsightDto, @AuthUser() user: User) {
    return this.service.update(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('publish')
  publish(@Body() dto: InsightIdDto, @AuthUser() user: User) {
    return this.service.publish(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('retire')
  retire(@Body() dto: InsightIdDto, @AuthUser() user: User) {
    return this.service.retire(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  delete(@Body() dto: InsightIdDto, @AuthUser() user: User) {
    return this.service.delete(dto, user);
  }
}
