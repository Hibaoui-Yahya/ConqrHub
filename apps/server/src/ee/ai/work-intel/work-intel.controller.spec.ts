import { NotFoundException } from '@nestjs/common';
import { WorkIntelController } from './work-intel.controller';

function makeController(overrides: Partial<Record<string, any>> = {}) {
  const workIntel = {
    findSimilar: jest.fn(),
    predictLabels: jest.fn(),
    ...overrides.workIntel,
  };
  const mappings = {
    listForProject: jest.fn(),
    listForWorkspace: jest.fn(),
    ...overrides.mappings,
  };
  const aiQueue = {
    add: jest.fn(),
    ...overrides.aiQueue,
  };
  const controller = new WorkIntelController(
    workIntel as any,
    mappings as any,
    aiQueue as any,
  );
  return { controller, workIntel, mappings, aiQueue };
}

describe('WorkIntelController', () => {
  describe('backfill', () => {
    it('rejects a projectId that does not belong to the caller workspace', async () => {
      const { controller, mappings, aiQueue } = makeController({
        mappings: { listForProject: jest.fn().mockResolvedValue([]) },
      });

      await expect(
        controller.backfill(
          { projectId: 'foreign-project' } as any,
          { id: 'ws-1' } as any,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mappings.listForProject).toHaveBeenCalledWith(
        'ws-1',
        'foreign-project',
      );
      expect(aiQueue.add).not.toHaveBeenCalled();
    });

    it('enqueues a backfill for a projectId mapped to the caller workspace', async () => {
      const { controller, mappings, aiQueue } = makeController({
        mappings: {
          listForProject: jest.fn().mockResolvedValue([{ id: 'mapping-1' }]),
        },
      });

      const result = await controller.backfill(
        { projectId: 'owned-project' } as any,
        { id: 'ws-1' } as any,
      );

      expect(mappings.listForProject).toHaveBeenCalledWith(
        'ws-1',
        'owned-project',
      );
      expect(aiQueue.add).toHaveBeenCalledTimes(1);
      expect(aiQueue.add).toHaveBeenCalledWith(expect.any(String), {
        projectId: 'owned-project',
      });
      expect(result).toEqual({ enqueued: 1 });
    });
  });
});
