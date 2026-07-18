import { BadRequestException } from '@nestjs/common';
import { RelationshipService } from './relationship.service';
import { RelationType } from '../domain/relationship-types';

// A fake db whose transaction() runs the callback with a sentinel trx.
const fakeTrx = { __trx: true } as any;
const db = {
  transaction: () => ({
    execute: (fn: (trx: any) => any) => fn(fakeTrx),
  }),
} as any;

function makeService() {
  const relationships = {
    insertIfAbsent: jest.fn(),
    findEdge: jest.fn(),
    findById: jest.fn(),
    findForUrn: jest.fn(),
    softDelete: jest.fn(),
  };
  const events = { record: jest.fn() };
  const service = new RelationshipService(
    db,
    relationships as any,
    events as any,
  );
  return { service, relationships, events };
}

const base = {
  workspaceId: 'ws1',
  actorId: 'u1',
  sourceUrn: 'conqr://hub/page/p1',
  targetUrn: 'conqr://plane/work-item/wi1',
  relationType: RelationType.ImplementedBy,
};

describe('RelationshipService', () => {
  it('creates a new edge, stores the inverse, and records one event', async () => {
    const { service, relationships, events } = makeService();
    relationships.insertIfAbsent.mockResolvedValue({ id: 'rel1' });

    const result = await service.create(base);

    expect(result).toEqual({ id: 'rel1' });
    const inserted = relationships.insertIfAbsent.mock.calls[0][0];
    expect(inserted.relationType).toBe('implemented_by');
    expect(inserted.inverseRelationType).toBe('implements');
    expect(events.record).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: returns the existing edge and records NO event on conflict', async () => {
    const { service, relationships, events } = makeService();
    relationships.insertIfAbsent.mockResolvedValue(undefined); // conflict
    relationships.findEdge.mockResolvedValue({ id: 'existing' });

    const result = await service.create(base);

    expect(result).toEqual({ id: 'existing' });
    expect(events.record).not.toHaveBeenCalled();
  });

  it('rejects an unknown relation type', async () => {
    const { service } = makeService();
    await expect(
      service.create({ ...base, relationType: 'is_related' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed URN', async () => {
    const { service } = makeService();
    await expect(
      service.create({ ...base, sourceUrn: 'not-a-urn' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a self-referential edge', async () => {
    const { service } = makeService();
    await expect(
      service.create({ ...base, targetUrn: base.sourceUrn }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
