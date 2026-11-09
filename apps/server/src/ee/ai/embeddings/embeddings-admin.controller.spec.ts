import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../common/helpers/types/permission';
import { EmbeddingsAdminController } from './embeddings-admin.controller';

describe('knowledge reindex authorization', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const foreignId = '22222222-2222-4222-8222-222222222222';

  function setup() {
    const query: any = {};
    for (const method of ['select', 'where']) query[method] = jest.fn(() => query);
    query.execute = jest.fn(async () => []);
    const db = { selectFrom: jest.fn(() => query) };
    const env = {
      getAiEmbeddingChunkChars: jest.fn(() => 4000),
      getAiEmbeddingChunkOverlap: jest.fn(() => 300),
    };
    const indexer = { indexPage: jest.fn() };
    const queue = { add: jest.fn() };
    const controller = new EmbeddingsAdminController(
      db as any, queue as any, env as any, {} as any, indexer as any,
    );
    return { controller, db, queue, indexer };
  }

  it.each([UserRole.OWNER, UserRole.ADMIN])('permits %s within their workspace', async (role) => {
    const { controller, db } = setup();
    const result = await controller.backfill(
      { workspaceId, dryRun: true },
      { role, workspaceId } as any,
      { id: workspaceId } as any,
    );
    expect(result.estimatedPages).toBe(0);
    expect(db.selectFrom).toHaveBeenCalledWith('pages');
  });

  it.each([
    ['member', UserRole.MEMBER, workspaceId, workspaceId],
    ['foreign target', UserRole.OWNER, foreignId, workspaceId],
    ['inconsistent authenticated workspace', UserRole.ADMIN, workspaceId, foreignId],
  ])('rejects %s before accessing content or invoking a provider', async (_name, role, target, userWorkspace) => {
    const { controller, db, queue, indexer } = setup();
    await expect(controller.backfill(
      { workspaceId: target, sourceKind: 'expert_insight', dryRun: false },
      { role, workspaceId: userWorkspace } as any,
      { id: workspaceId } as any,
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.selectFrom).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(indexer.indexPage).not.toHaveBeenCalled();
  });
});
