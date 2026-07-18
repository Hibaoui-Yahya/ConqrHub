import { PlaneWebhookService, WebhookOutcome } from './plane-webhook.service';
import { computeSignature } from '../domain/webhook-signature.util';

const SECRET = 'whsec';
const body = JSON.stringify({ event: 'issue', action: 'updated', data: { id: 'wi1' } });

function makeService(opts: { secret?: string; process?: jest.Mock } = {}) {
  const deliveries = {
    recordIfNew: jest.fn(),
    findByDeliveryId: jest.fn(),
    markProcessed: jest.fn(),
    incrementAttempts: jest.fn(),
    setParsed: jest.fn(),
    resetForReplay: jest.fn(),
    listDeadLettered: jest.fn(),
  };
  const environment = { getPlaneWebhookSecret: () => opts.secret ?? SECRET };
  const processor = {
    parse: (b: any) => (b ? JSON.parse(b.toString()) : null),
    process:
      opts.process ??
      jest.fn().mockResolvedValue({ affectedWorkspaces: 1, subject: 'conqr://plane/work-item/wi1' }),
  };
  const service = new PlaneWebhookService(
    deliveries as any,
    environment as any,
    processor as any,
  );
  return { service, deliveries, processor };
}

const validSig = () => computeSignature(body, SECRET);

describe('PlaneWebhookService', () => {
  it('accepts, processes, and marks a first-seen delivery processed', async () => {
    const { service, deliveries } = makeService();
    deliveries.recordIfNew.mockResolvedValue({ id: 'd1', status: 'received' });

    const res = await service.ingest({
      rawBody: body,
      signature: validSig(),
      deliveryId: 'del_1',
    });

    expect(res.outcome).toBe(WebhookOutcome.Accepted);
    expect(deliveries.markProcessed).toHaveBeenCalledWith('d1', 'processed');
  });

  it('rejects an invalid signature and never records it', async () => {
    const { service, deliveries } = makeService();
    const res = await service.ingest({
      rawBody: body,
      signature: 'bad',
      deliveryId: 'del_1',
    });
    expect(res.outcome).toBe(WebhookOutcome.InvalidSignature);
    expect(deliveries.recordIfNew).not.toHaveBeenCalled();
  });

  it('treats an ALREADY-PROCESSED delivery as duplicate', async () => {
    const { service, deliveries, processor } = makeService();
    deliveries.recordIfNew.mockResolvedValue(undefined);
    deliveries.findByDeliveryId.mockResolvedValue({ id: 'd1', status: 'processed' });

    const res = await service.ingest({
      rawBody: body,
      signature: validSig(),
      deliveryId: 'del_1',
    });
    expect(res.outcome).toBe(WebhookOutcome.Duplicate);
    expect(processor.process).not.toHaveBeenCalled();
  });

  it('REPROCESSES a previously-failed delivery on Plane redelivery', async () => {
    const { service, deliveries, processor } = makeService();
    deliveries.recordIfNew.mockResolvedValue(undefined);
    deliveries.findByDeliveryId.mockResolvedValue({ id: 'd1', status: 'failed' });

    const res = await service.ingest({
      rawBody: body,
      signature: validSig(),
      deliveryId: 'del_1',
    });
    expect(processor.process).toHaveBeenCalled();
    expect(res.outcome).toBe(WebhookOutcome.Accepted);
  });

  it('returns Failed (retryable) then DeadLettered at the attempt cap', async () => {
    const process = jest.fn().mockRejectedValue(new Error('boom'));
    const { service, deliveries } = makeService({ process });
    deliveries.recordIfNew.mockResolvedValue({ id: 'd1', status: 'received' });

    deliveries.incrementAttempts.mockResolvedValueOnce(1);
    let res = await service.ingest({ rawBody: body, signature: validSig(), deliveryId: 'del_1' });
    expect(res.outcome).toBe(WebhookOutcome.Failed);

    deliveries.incrementAttempts.mockResolvedValueOnce(5);
    res = await service.ingest({ rawBody: body, signature: validSig(), deliveryId: 'del_1' });
    expect(res.outcome).toBe(WebhookOutcome.DeadLettered);
    expect(deliveries.markProcessed).toHaveBeenCalledWith('d1', 'dead_letter', 'boom');
  });

  it('reports disabled when no secret is configured', async () => {
    const { service } = makeService({ secret: '' });
    const res = await service.ingest({ rawBody: body, signature: 'x' });
    expect(res.outcome).toBe(WebhookOutcome.Disabled);
  });

  it('replays a dead-lettered delivery from stored subject/action', async () => {
    const { service, deliveries, processor } = makeService();
    deliveries.findByDeliveryId.mockResolvedValue({
      id: 'd1',
      status: 'dead_letter',
      subject: 'conqr://plane/work-item/wi1',
      action: 'updated',
    });
    const res = await service.replay('del_1');
    expect(deliveries.resetForReplay).toHaveBeenCalledWith('d1');
    expect(processor.process).toHaveBeenCalledWith(
      { event: 'issue', action: 'updated', data: { id: 'wi1' } },
      'del_1',
    );
    expect(res.outcome).toBe(WebhookOutcome.Accepted);
  });
});
