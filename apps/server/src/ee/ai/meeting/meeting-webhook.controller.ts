import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { MeetingPipelineService } from './meeting-pipeline.service';

/**
 * Speechmatics notification callback (public route; authenticated by the
 * per-job bearer token minted at submission — see
 * CONQR_MEETING_API_CONTRACTS.md §3). The body is ignored entirely: the
 * transcript is re-fetched from the provider API, so a forged call can at
 * most trigger a re-check. Replies fast; heavy work is queued.
 */
@Controller('ai/meeting/webhook')
export class MeetingWebhookController {
  constructor(private readonly pipeline: MeetingPipelineService) {}

  @Post('speechmatics')
  @HttpCode(HttpStatus.OK)
  async speechmatics(
    @Query('id') providerJobId: string,
    @Query('status') status: string,
    @Headers('authorization') authorization?: string,
  ) {
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : null;
    const result = await this.pipeline.handleProviderCallback({
      providerJobId: providerJobId ?? '',
      status: status ?? 'unknown',
      bearerToken,
    });
    return { received: true, result };
  }
}
