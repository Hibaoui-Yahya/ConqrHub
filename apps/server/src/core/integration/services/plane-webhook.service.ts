import { Injectable, Logger } from '@nestjs/common';
import { WebhookDeliveryRepo } from '@docmost/db/repos/integration/webhook-delivery.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { verifyPlaneSignature } from '../domain/webhook-signature.util';
import { PlaneWebhookProcessorService } from './plane-webhook-processor.service';

export enum WebhookOutcome {
  Accepted = 'accepted',
  Duplicate = 'duplicate',
  InvalidSignature = 'invalid_signature',
  Disabled = 'disabled',
  /** Transient processing failure — caller should 5xx so Plane retries. */
  Failed = 'failed',
  /** Exhausted retries — moved to dead-letter; acknowledge to stop retries. */
  DeadLettered = 'dead_lettered',
}

export interface WebhookIngestResult {
  outcome: WebhookOutcome;
  deliveryId?: string;
}

const MAX_ATTEMPTS = 5;

/**
 * Ingests a Plane webhook (blueprint §8.4, §9.4, §10): verify HMAC over the raw
 * body, dedup only ALREADY-PROCESSED deliveries (so a failed delivery Plane
 * re-sends is reprocessed), process idempotently, and move poison deliveries to
 * a dead-letter status after {@link MAX_ATTEMPTS}. Dead-lettered deliveries can
 * be self-replayed by an administrator.
 */
@Injectable()
export class PlaneWebhookService {
  private readonly logger = new Logger(PlaneWebhookService.name);

  constructor(
    private readonly deliveries: WebhookDeliveryRepo,
    private readonly environment: EnvironmentService,
    private readonly processor: PlaneWebhookProcessorService,
  ) {}

  async ingest(params: {
    rawBody: Buffer | string | undefined;
    signature?: string;
    deliveryId?: string;
    eventType?: string;
  }): Promise<WebhookIngestResult> {
    const secret = this.environment.getPlaneWebhookSecret();
    if (!secret) return { outcome: WebhookOutcome.Disabled };

    if (!verifyPlaneSignature(params.rawBody, params.signature, secret)) {
      this.logger.warn(
        `Rejected Plane webhook: invalid signature (delivery ${params.deliveryId ?? 'unknown'})`,
      );
      return { outcome: WebhookOutcome.InvalidSignature };
    }

    const deliveryId = params.deliveryId?.trim();
    if (!deliveryId) return { outcome: WebhookOutcome.InvalidSignature };

    // Inbox: insert or fetch the existing row. Skip only if already processed.
    let row = await this.deliveries.recordIfNew({
      source: 'plane',
      deliveryId,
      eventType: params.eventType ?? null,
      signatureValid: true,
      status: 'received',
    });
    if (!row) {
      const existing = await this.deliveries.findByDeliveryId('plane', deliveryId);
      if (!existing || existing.status === 'processed') {
        return { outcome: WebhookOutcome.Duplicate, deliveryId };
      }
      row = existing; // prior failed/received delivery → reprocess
    }

    const payload = this.processor.parse(params.rawBody);
    return this.runProcessing(row.id, deliveryId, payload);
  }

  /** Replay a dead-lettered delivery using its stored minimal metadata (§10). */
  async replay(deliveryId: string): Promise<WebhookIngestResult> {
    const existing = await this.deliveries.findByDeliveryId('plane', deliveryId);
    if (!existing) return { outcome: WebhookOutcome.Duplicate, deliveryId };

    await this.deliveries.resetForReplay(existing.id);
    // Reconstruct a minimal event from stored subject/action (no raw body kept).
    const id = existing.subject?.split('/').pop();
    const payload = id
      ? { event: 'issue', action: existing.action ?? 'updated', data: { id } }
      : null;
    return this.runProcessing(existing.id, deliveryId, payload);
  }

  listDeadLettered() {
    return this.deliveries.listDeadLettered();
  }

  private async runProcessing(
    rowId: string,
    deliveryId: string,
    payload: ReturnType<PlaneWebhookProcessorService['parse']>,
  ): Promise<WebhookIngestResult> {
    try {
      const result = await this.processor.process(payload, deliveryId);
      await this.deliveries.setParsed(
        rowId,
        result.subject ?? null,
        payload?.action ?? null,
      );
      await this.deliveries.markProcessed(rowId, 'processed');
      return { outcome: WebhookOutcome.Accepted, deliveryId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = await this.deliveries.incrementAttempts(rowId);
      if (attempts >= MAX_ATTEMPTS) {
        await this.deliveries.markProcessed(rowId, 'dead_letter', message);
        this.logger.error(
          `Plane webhook ${deliveryId} dead-lettered after ${attempts} attempts: ${message}`,
        );
        return { outcome: WebhookOutcome.DeadLettered, deliveryId };
      }
      await this.deliveries.markProcessed(rowId, 'failed', message);
      this.logger.warn(
        `Plane webhook ${deliveryId} failed (attempt ${attempts}): ${message}`,
      );
      return { outcome: WebhookOutcome.Failed, deliveryId };
    }
  }
}
