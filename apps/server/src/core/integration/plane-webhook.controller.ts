import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Req,
  UnauthorizedException,
  RawBodyRequest,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { PlaneWebhookService, WebhookOutcome } from './services/plane-webhook.service';
import {
  PLANE_DELIVERY_HEADER,
  PLANE_EVENT_HEADER,
  PLANE_SIGNATURE_HEADER,
} from './domain/webhook-signature.util';

/**
 * Receives Plane webhooks (blueprint §9.4). Unauthenticated by design — trust
 * comes from the HMAC signature over the raw body, not a session. Excluded from
 * the domain/audit middleware in CoreModule because it has no workspace context.
 */
@Controller('integrations/plane')
export class PlaneWebhookController {
  constructor(private readonly webhookService: PlaneWebhookService) {}

  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async receive(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers(PLANE_SIGNATURE_HEADER) signature?: string,
    @Headers(PLANE_DELIVERY_HEADER) deliveryId?: string,
    @Headers(PLANE_EVENT_HEADER) eventType?: string,
  ) {
    const result = await this.webhookService.ingest({
      rawBody: req.rawBody,
      signature,
      deliveryId,
      eventType,
    });

    switch (result.outcome) {
      case WebhookOutcome.InvalidSignature:
        // Uniform 401 — never reveal which check failed.
        throw new UnauthorizedException('Invalid signature');
      case WebhookOutcome.Disabled:
        // Integration off: acknowledge so Plane doesn't retry indefinitely.
        return { received: true, status: 'integration_disabled' };
      case WebhookOutcome.Duplicate:
        return { received: true, status: 'duplicate' };
      case WebhookOutcome.Failed:
        // Transient failure — 5xx so Plane redelivers (dedup lets us retry).
        throw new InternalServerErrorException('Processing failed; retry');
      case WebhookOutcome.DeadLettered:
        // Exhausted retries — acknowledge so Plane stops; admin can replay.
        return { received: true, status: 'dead_lettered' };
      default:
        return { received: true, status: 'accepted' };
    }
  }
}
