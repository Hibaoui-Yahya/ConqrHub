// The real gateway pulls happy-dom (ESM) through the collaboration utils.
jest.mock('../../collaboration/collaboration.gateway', () => ({
  CollaborationGateway: class MockCollaborationGateway {},
}));
jest.mock('../../collaboration/collaboration.util', () => ({}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { QueueJob } from '../../integrations/queue/constants';
import { AuditEvent } from '../../common/events/audit-events';

const AUTHOR = { id: 'u-author', workspaceId: 'ws-1' } as any;
const OTHER = { id: 'u-other', workspaceId: 'ws-1' } as any;

function thread(extra: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    pageId: 'p-1',
    spaceId: 's-1',
    workspaceId: 'ws-1',
    creatorId: AUTHOR.id,
    parentCommentId: null,
    type: 'inline',
    resolvedAt: null,
    resolvedById: null,
    content: { type: 'doc' },
    ...extra,
  } as any;
}

function makeService(stored: any) {
  const commentRepo = {
    updateComment: jest.fn(async (values: any) => Object.assign(stored, values)),
    findById: jest.fn(async () => ({ ...stored, resolvedBy: stored.resolvedById ? { id: stored.resolvedById } : null })),
  };
  const wsService = { emitCommentEvent: jest.fn() };
  const collaborationGateway = { handleYjsEvent: jest.fn(async () => undefined) };
  const notificationQueue = { add: jest.fn(async () => undefined) };
  const generalQueue = { add: jest.fn(async () => undefined) };
  const service = new CommentService(
    commentRepo as any,
    {} as any,
    wsService as any,
    collaborationGateway as any,
    generalQueue as any,
    notificationQueue as any,
  );
  return { service, commentRepo, wsService, collaborationGateway, notificationQueue };
}

describe('CommentService.resolve', () => {
  it('resolves a thread, records who did it and tells the author', async () => {
    const stored = thread();
    const { service, commentRepo, wsService, collaborationGateway, notificationQueue } =
      makeService(stored);

    const { comment, changed } = await service.resolve(thread(), true, OTHER);

    expect(changed).toBe(true);
    const values = commentRepo.updateComment.mock.calls[0][0];
    expect(values.resolvedAt).toBeInstanceOf(Date);
    expect(values.resolvedById).toBe(OTHER.id);
    expect(comment.resolvedById).toBe(OTHER.id);
    expect(collaborationGateway.handleYjsEvent).toHaveBeenCalledWith(
      'resolveCommentMark',
      'page.p-1',
      expect.objectContaining({ commentId: 'c-1', resolved: true }),
    );
    expect(notificationQueue.add).toHaveBeenCalledWith(
      QueueJob.COMMENT_RESOLVED_NOTIFICATION,
      expect.objectContaining({
        commentId: 'c-1',
        commentCreatorId: AUTHOR.id,
        actorId: OTHER.id,
        pageId: 'p-1',
        spaceId: 's-1',
        workspaceId: 'ws-1',
      }),
    );
    expect(wsService.emitCommentEvent).toHaveBeenCalledWith(
      's-1',
      'p-1',
      expect.objectContaining({ operation: 'commentResolved' }),
    );
  });

  it('re-opens a thread without notifying anyone', async () => {
    const resolvedAt = new Date('2026-10-01T10:00:00Z');
    const stored = thread({ resolvedAt, resolvedById: OTHER.id });
    const { service, commentRepo, notificationQueue } = makeService(stored);

    const { changed } = await service.resolve(
      thread({ resolvedAt, resolvedById: OTHER.id }),
      false,
      OTHER,
    );

    expect(changed).toBe(true);
    expect(commentRepo.updateComment.mock.calls[0][0]).toMatchObject({
      resolvedAt: null,
      resolvedById: null,
    });
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('does not notify the author who resolves their own thread', async () => {
    const { service, notificationQueue } = makeService(thread());
    await service.resolve(thread(), true, AUTHOR);
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('changes nothing when the thread is already in that state', async () => {
    const { service, commentRepo, wsService, notificationQueue } = makeService(thread());
    const { changed } = await service.resolve(thread(), false, OTHER);
    expect(changed).toBe(false);
    expect(commentRepo.updateComment).not.toHaveBeenCalled();
    expect(wsService.emitCommentEvent).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();
  });

  it('refuses to resolve a reply', async () => {
    const { service } = makeService(thread());
    await expect(
      service.resolve(thread({ parentCommentId: 'c-0' }), true, OTHER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CommentController.resolve permissions', () => {
  function makeController(opts: { canEdit: boolean; spaceAdmin: boolean }) {
    const commentService = {
      resolve: jest.fn(async (c: any) => ({ comment: c, changed: true })),
    };
    const commentRepo = { findById: jest.fn(async () => thread()) };
    const pageRepo = {
      findById: jest.fn(async () => ({
        id: 'p-1',
        spaceId: 's-1',
        workspaceId: 'ws-1',
        deletedAt: null,
      })),
    };
    const pageAccessService = {
      validateCanComment: jest.fn(async () => undefined),
      validateCanEdit: jest.fn(async () => {
        if (!opts.canEdit) throw new ForbiddenException();
      }),
    };
    const spaceAbility = {
      createForUser: jest.fn(async () => ({
        cannot: () => !opts.spaceAdmin,
      })),
    };
    const auditService = { log: jest.fn() };
    const controller = new CommentController(
      commentService as any,
      commentRepo as any,
      pageRepo as any,
      spaceAbility as any,
      pageAccessService as any,
      { emitCommentEvent: jest.fn() } as any,
      auditService as any,
    );
    return { controller, commentService, auditService };
  }
  const dto = { commentId: 'c-1', resolved: true };
  const ws = { id: 'ws-1' } as any;

  it('lets the author resolve their own thread', async () => {
    const { controller, commentService, auditService } = makeController({
      canEdit: false,
      spaceAdmin: false,
    });
    await controller.resolve(dto, AUTHOR, ws);
    expect(commentService.resolve).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.COMMENT_RESOLVED }),
    );
  });

  it('lets a page editor resolve someone else’s thread', async () => {
    const { controller, commentService } = makeController({
      canEdit: true,
      spaceAdmin: false,
    });
    await controller.resolve(dto, OTHER, ws);
    expect(commentService.resolve).toHaveBeenCalled();
  });

  it('refuses a commenter who can neither edit the page nor administer the space', async () => {
    const { controller, commentService } = makeController({
      canEdit: false,
      spaceAdmin: false,
    });
    await expect(controller.resolve(dto, OTHER, ws)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(commentService.resolve).not.toHaveBeenCalled();
  });
});
