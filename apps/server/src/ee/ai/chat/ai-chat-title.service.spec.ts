import { AiChatTitleService } from './ai-chat-title.service';
import { AiProviderService } from '../providers/ai-provider.service';
import { AiChatRepo } from '@docmost/db/repos/ai-chat/ai-chat.repo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAiProvider(text = 'A concise title'): jest.Mocked<Pick<AiProviderService, 'generate'>> {
  return {
    generate: jest.fn().mockResolvedValue({ text }),
  } as any;
}

function makeChatRepo(): jest.Mocked<Pick<AiChatRepo, 'update'>> {
  return { update: jest.fn().mockResolvedValue(undefined) } as any;
}

function makeSvc(
  ai: ReturnType<typeof makeAiProvider>,
  repo: ReturnType<typeof makeChatRepo>,
): AiChatTitleService {
  return new AiChatTitleService(ai as any, repo as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiChatTitleService.generate()', () => {
  it('calls aiProvider.generate with a system prompt and the user message', async () => {
    const ai = makeAiProvider();
    const repo = makeChatRepo();
    const svc = makeSvc(ai, repo);

    await svc.generate('chat-1', 'ws-1', 'How does authentication work?');

    expect(ai.generate).toHaveBeenCalledTimes(1);
    const { system, prompt, temperature, maxOutputTokens } =
      (ai.generate as jest.Mock).mock.calls[0][0];
    expect(system).toContain('4-6 word title');
    expect(prompt).toBe('How does authentication work?');
    expect(temperature).toBe(0.3);
    expect(maxOutputTokens).toBe(24);
  });

  it('persists the generated title to the repo', async () => {
    const ai = makeAiProvider('Authentication Basics');
    const repo = makeChatRepo();
    const svc = makeSvc(ai, repo);

    await svc.generate('chat-1', 'ws-1', 'Explain auth');

    expect(repo.update).toHaveBeenCalledWith(
      'chat-1',
      'ws-1',
      expect.objectContaining({ title: 'Authentication Basics' }),
    );
  });

  it('truncates the user message to 500 chars before passing to the LLM', async () => {
    const ai = makeAiProvider('Short');
    const repo = makeChatRepo();
    const svc = makeSvc(ai, repo);
    const longMsg = 'A'.repeat(600);

    await svc.generate('chat-1', 'ws-1', longMsg);

    const { prompt } = (ai.generate as jest.Mock).mock.calls[0][0];
    expect(prompt.length).toBe(500);
  });

  it('swallows LLM errors and does not call repo.update', async () => {
    const ai = makeAiProvider();
    (ai.generate as jest.Mock).mockRejectedValue(new Error('503'));
    const repo = makeChatRepo();
    const svc = makeSvc(ai, repo);

    await expect(svc.generate('chat-1', 'ws-1', 'Hello')).resolves.not.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('does not update repo if the generated title is empty', async () => {
    const ai = makeAiProvider('');
    const repo = makeChatRepo();
    const svc = makeSvc(ai, repo);

    await svc.generate('chat-1', 'ws-1', 'Hello');

    expect(repo.update).not.toHaveBeenCalled();
  });
});
