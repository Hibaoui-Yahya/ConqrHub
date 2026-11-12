import { EnvironmentService } from '../../../integrations/environment/environment.service';

/**
 * Prod 2026-11-12: the Mistral model reasons before answering. With a fixed
 * output budget, every report attempt ended finishReason "length" with 0
 * characters (~90 s each). One-shot calls now ask for no reasoning.
 */
const generateText = jest.fn();
jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: (...args: unknown[]) => generateText(...args),
}));
jest.mock('@ai-sdk/mistral', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'mistral' })),
    textEmbeddingModel: jest.fn((id: string) => ({ id })),
  };
  return { createMistral: jest.fn(() => factory) };
});
jest.mock('@ai-sdk/openai', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'openai' })),
    textEmbeddingModel: jest.fn((id: string) => ({ id })),
  };
  return { createOpenAI: jest.fn(() => factory) };
});

import { AiProviderService } from './ai-provider.service';

function service(driver: string) {
  const env = {
    getAiDriver: () => driver,
    getAiCompletionModel: () => undefined,
    getAiChatModel: () => undefined,
    getAiEmbeddingModel: () => undefined,
    getAiEmbeddingDimension: () => Number.NaN,
    getMistralApiKey: () => 'k',
    getOpenAiApiKey: () => 'k',
    getOpenAiApiUrl: () => undefined,
  } as unknown as EnvironmentService;
  const svc = new AiProviderService(env);
  svc.onModuleInit();
  return svc;
}

const ok = { text: 'Bonjour.', finishReason: 'stop', usage: {} };

describe('one-shot calls and reasoning models', () => {
  beforeEach(() => {
    generateText.mockReset();
    delete process.env.AI_ONE_SHOT_REASONING;
  });

  it('asks Mistral for no reasoning on generate and generateJson', async () => {
    generateText.mockResolvedValue({ ...ok, output: { a: 1 } });
    const svc = service('mistral');
    await svc.generate({ prompt: 'x' });
    await svc.generateJson({ prompt: 'x' });
    for (const call of generateText.mock.calls) {
      expect(call[0].providerOptions).toEqual({ mistral: { reasoningEffort: 'none' } });
    }
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('sends nothing for another driver', async () => {
    generateText.mockResolvedValue(ok);
    await service('openai').generate({ prompt: 'x' });
    expect(generateText.mock.calls[0][0].providerOptions).toBeUndefined();
  });

  it('retries without the option when the model refuses it, then stops sending it', async () => {
    const refusal = Object.assign(new Error('Bad request'), {
      statusCode: 422,
      responseBody: '{"detail":[{"loc":["body","reasoning_effort"],"msg":"Extra inputs are not permitted"}]}',
    });
    generateText.mockRejectedValueOnce(refusal).mockResolvedValue(ok);
    const svc = service('mistral');
    expect((await svc.generate({ prompt: 'x' })).text).toBe('Bonjour.');
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[1][0].providerOptions).toBeUndefined();
    await svc.generate({ prompt: 'y' });
    expect(generateText.mock.calls[2][0].providerOptions).toBeUndefined();
  });

  it('does not swallow other provider errors', async () => {
    generateText.mockRejectedValue(Object.assign(new Error('rate limited'), { statusCode: 429 }));
    await expect(service('mistral').generate({ prompt: 'x' })).rejects.toThrow('rate limited');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('AI_ONE_SHOT_REASONING=default keeps the model behaviour', async () => {
    process.env.AI_ONE_SHOT_REASONING = 'default';
    generateText.mockResolvedValue(ok);
    await service('mistral').generate({ prompt: 'x' });
    expect(generateText.mock.calls[0][0].providerOptions).toBeUndefined();
  });

  it('reports the finish reason of a cut answer', async () => {
    generateText.mockResolvedValue({ text: '', finishReason: 'length', usage: { outputTokens: 8000, reasoningTokens: 8000 } });
    const out = await service('mistral').generate({ prompt: 'x', maxOutputTokens: 8000 });
    expect(out).toMatchObject({ text: '', finishReason: 'length' });
  });
});
