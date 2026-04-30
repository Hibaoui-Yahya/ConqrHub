import { NotFoundException } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';
import { AiChatMessageRepo } from '@docmost/db/repos/ai-chat/ai-chat-message.repo';
import { AiChat, AiChatMessage } from '@docmost/db/types/entity.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS_A = 'ws-a';
const WS_B = 'ws-b';
const USER_A: any = { id: 'user-a', workspaceId: WS_A };
const USER_B: any = { id: 'user-b', workspaceId: WS_A }; // different user, same workspace
const USER_C: any = { id: 'user-c', workspaceId: WS_B }; // different workspace

function makeChat(
  overrides: Partial<AiChat> = {},
): AiChat {
  return {
    id: 'chat-1',
    workspaceId: WS_A,
    creatorId: USER_A.id,
    title: null,
    createdAt: new Date() as any,
    updatedAt: new Date() as any,
    deletedAt: null,
    ...overrides,
  } as AiChat;
}

function makeChatRepo(chat?: AiChat): jest.Mocked<AiChatRepo> {
  const stored = chat;
  return {
    insert: jest.fn().mockImplementation(async (vals) =>
      makeChat({ workspaceId: vals.workspaceId, creatorId: vals.creatorId }),
    ),
    findById: jest.fn().mockImplementation(async (id, wsId) =>
      stored && stored.id === id && stored.workspaceId === wsId ? stored : undefined,
    ),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    listByCreator: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
    hasTitleSet: jest.fn().mockResolvedValue(false),
  } as any;
}

function makeMessageRepo(messages: AiChatMessage[] = []): jest.Mocked<AiChatMessageRepo> {
  return {
    listByChat: jest.fn().mockResolvedValue(messages),
    insert: jest.fn().mockResolvedValue({ id: 'msg-1' }),
    countByChat: jest.fn().mockResolvedValue(0),
    searchByWorkspace: jest.fn().mockResolvedValue([]),
  } as any;
}

function makeSvc(
  chatRepo: jest.Mocked<AiChatRepo>,
  msgRepo: jest.Mocked<AiChatMessageRepo>,
): AiChatService {
  return new AiChatService(chatRepo, msgRepo);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiChatService.create()', () => {
  it('creates a chat scoped to the requesting user and workspace', async () => {
    const repo = makeChatRepo();
    const svc = makeSvc(repo, makeMessageRepo());

    const chat = await svc.create(USER_A);

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ creatorId: USER_A.id, workspaceId: WS_A }),
    );
    expect(chat.workspaceId).toBe(WS_A);
    expect(chat.creatorId).toBe(USER_A.id);
  });
});

describe('AiChatService.info()', () => {
  it('returns chat + messages for the owner', async () => {
    const chat = makeChat();
    const msgs: AiChatMessage[] = [{ id: 'msg-1', role: 'user' } as any];
    const repo = makeChatRepo(chat);
    const msgRepo = makeMessageRepo(msgs);
    const svc = makeSvc(repo, msgRepo);

    const result = await svc.info('chat-1', USER_A);

    expect(result.chat.id).toBe('chat-1');
    expect(result.messages).toHaveLength(1);
  });

  it('throws NotFoundException for a different workspace (cross-workspace isolation)', async () => {
    const chat = makeChat({ workspaceId: WS_A });
    const repo = makeChatRepo(chat);
    const svc = makeSvc(repo, makeMessageRepo());

    // USER_C is in WS_B — findById scopes to workspaceId so it returns undefined
    await expect(svc.info('chat-1', USER_C)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the chat belongs to a different creator', async () => {
    const chat = makeChat({ creatorId: USER_A.id });
    const repo = makeChatRepo(chat);
    const svc = makeSvc(repo, makeMessageRepo());

    // USER_B is in the same workspace but not the creator
    await expect(svc.info('chat-1', USER_B)).rejects.toThrow(NotFoundException);
  });
});

describe('AiChatService.delete()', () => {
  it('soft-deletes the chat when called by the owner', async () => {
    const chat = makeChat();
    const repo = makeChatRepo(chat);
    const svc = makeSvc(repo, makeMessageRepo());

    await svc.delete('chat-1', USER_A);

    expect(repo.softDelete).toHaveBeenCalledWith('chat-1', WS_A);
  });

  it('throws NotFoundException when called by a different user in the same workspace', async () => {
    const chat = makeChat({ creatorId: USER_A.id });
    const repo = makeChatRepo(chat);
    const svc = makeSvc(repo, makeMessageRepo());

    await expect(svc.delete('chat-1', USER_B)).rejects.toThrow(NotFoundException);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
});

describe('AiChatService.update()', () => {
  it('updates the title when called by the owner', async () => {
    const chat = makeChat();
    const repo = makeChatRepo(chat);
    const svc = makeSvc(repo, makeMessageRepo());

    await svc.update({ chatId: 'chat-1', title: 'New Title' }, USER_A);

    expect(repo.update).toHaveBeenCalledWith(
      'chat-1',
      WS_A,
      expect.objectContaining({ title: 'New Title' }),
    );
  });

  it('throws NotFoundException for a non-owner', async () => {
    const chat = makeChat({ creatorId: USER_A.id });
    const repo = makeChatRepo(chat);
    const svc = makeSvc(repo, makeMessageRepo());

    await expect(
      svc.update({ chatId: 'chat-1', title: 'Hack' }, USER_B),
    ).rejects.toThrow(NotFoundException);
    expect(repo.update).not.toHaveBeenCalled();
  });
});

describe('AiChatService.search()', () => {
  it('returns chats matching the query for the user', async () => {
    const chat = makeChat({ id: 'chat-1' });
    const repo = makeChatRepo(chat);
    const msgRepo = makeMessageRepo();
    (msgRepo.searchByWorkspace as jest.Mock).mockResolvedValue([
      { id: 'msg-1', chatId: 'chat-1', userId: USER_A.id },
    ]);
    const svc = makeSvc(repo, msgRepo);

    const results = await svc.search({ query: 'auth' }, USER_A);

    expect(msgRepo.searchByWorkspace).toHaveBeenCalledWith(
      WS_A,
      USER_A.id,
      'auth',
    );
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('chat-1');
  });

  it('returns an empty array when no messages match', async () => {
    const repo = makeChatRepo();
    const msgRepo = makeMessageRepo();
    (msgRepo.searchByWorkspace as jest.Mock).mockResolvedValue([]);
    const svc = makeSvc(repo, msgRepo);

    const results = await svc.search({ query: 'nothing' }, USER_A);

    expect(results).toEqual([]);
  });
});
