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

@UseGuards(JwtAuthGuard)
@Controller('insights')
export class ExpertInsightsController {
  constructor(private readonly service: ExpertInsightsService) {}

  @HttpCode(HttpStatus.CREATED)
  @Post('create')
  create(@Body() dto: CreateInsightDto, @AuthUser() user: User) {
    return this.service.create(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  list(@Body() dto: QueryInsightsDto, @AuthUser() user: User) {
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
