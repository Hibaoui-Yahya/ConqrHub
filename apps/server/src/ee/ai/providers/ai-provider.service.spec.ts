import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

// We mock the SDK provider factories. They normally return objects with
// Vercel-AI-SDK-internal shape; for unit tests we only care that the
// service wires the right factory with the right args and stores a
// truthy model reference. End-to-end model behavior is covered by the
// PR's manual test plan against real Mistral / OpenAI APIs.
//
// The factories are singletons-per-mock so that the service's three
// calls to providerFor() (completion + chat + embedding) all touch the
// same observable jest.fn() — assertions can read total invocations
// without indexing into mock.results.
jest.mock('@ai-sdk/mistral', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'mistral' })),
    textEmbeddingModel: jest.fn((id: string) => ({
      id,
      provider: 'mistral.embed',
    })),
  };
  return { createMistral: jest.fn(() => factory) };
});
jest.mock('@ai-sdk/openai', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'openai' })),
    textEmbeddingModel: jest.fn((id: string) => ({
      id,
      provider: 'openai.embed',
    })),
  };
  return { createOpenAI: jest.fn(() => factory) };
});
jest.mock('@ai-sdk/google', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'gemini' })),
    textEmbeddingModel: jest.fn((id: string) => ({
      id,
      provider: 'gemini.embed',
    })),
  };
  return { createGoogleGenerativeAI: jest.fn(() => factory) };
});
jest.mock('@ai-sdk/openai-compatible', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'compatible' })),
    textEmbeddingModel: jest.fn((id: string) => ({
      id,
      provider: 'compatible.embed',
    })),
  };
  return { createOpenAICompatible: jest.fn(() => factory) };
});
jest.mock('ai-sdk-ollama', () => {
  const factory = {
    languageModel: jest.fn((id: string) => ({ id, provider: 'ollama' })),
    textEmbeddingModel: jest.fn((id: string) => ({
      id,
      provider: 'ollama.embed',
    })),
  };
  return { createOllama: jest.fn(() => factory) };
});

import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOllama } from 'ai-sdk-ollama';

type EnvOverrides = Partial<{
  AI_DRIVER: string;
  AI_COMPLETION_MODEL: string;
  AI_CHAT_MODEL: string;
  AI_EMBEDDING_MODEL: string;
  AI_EMBEDDING_DIMENSION: number;
  MISTRAL_API_KEY: string;
  OPENAI_API_KEY: string;
  OPENAI_API_URL: string;
  GEMINI_API_KEY: string;
  OLLAMA_API_URL: string;
}>;

function buildEnv(overrides: EnvOverrides = {}): EnvironmentService {
  return {
    getAiDriver: () => overrides.AI_DRIVER,
    getAiCompletionModel: () => overrides.AI_COMPLETION_MODEL,
    getAiChatModel: () =>
      overrides.AI_CHAT_MODEL || overrides.AI_COMPLETION_MODEL,
    getAiEmbeddingModel: () => overrides.AI_EMBEDDING_MODEL,
    getAiEmbeddingDimension: () =>
      overrides.AI_EMBEDDING_DIMENSION ?? Number.NaN,
    getMistralApiKey: () => overrides.MISTRAL_API_KEY,
    getOpenAiApiKey: () => overrides.OPENAI_API_KEY,
    getOpenAiApiUrl: () => overrides.OPENAI_API_URL,
    getGeminiApiKey: () => overrides.GEMINI_API_KEY,
    getOllamaApiUrl: () => overrides.OLLAMA_API_URL ?? 'http://localhost:11434',
  } as unknown as EnvironmentService;
}

describe('AiProviderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDriver', () => {
    it('returns null when AI_DRIVER is unset', () => {
      const svc = new AiProviderService(buildEnv({}));
      expect(svc.getDriver()).toBeNull();
    });

    it.each([
      ['openai', 'openai'],
      ['gemini', 'gemini'],
      ['ollama', 'ollama'],
      ['openai-compatible', 'openai-compatible'],
      ['mistral', 'mistral'],
      ['  Mistral  ', 'mistral'],
      ['MISTRAL', 'mistral'],
    ])('normalises %s to %s', (raw, expected) => {
      const svc = new AiProviderService(buildEnv({ AI_DRIVER: raw }));
      expect(svc.getDriver()).toBe(expected);
    });

    it('falls back to openai for unknown drivers', () => {
      const svc = new AiProviderService(
        buildEnv({ AI_DRIVER: 'cohere-bring-your-own' }),
      );
      expect(svc.getDriver()).toBe('openai');
    });
  });

  describe('getEmbeddingDimension', () => {
    it('returns mistral default 1024 when driver=mistral and no env override', () => {
      const svc = new AiProviderService(buildEnv({ AI_DRIVER: 'mistral' }));
      expect(svc.getEmbeddingDimension()).toBe(1024);
    });

    it('returns openai-flavored default 1536 when driver=openai and no env override', () => {
      const svc = new AiProviderService(buildEnv({ AI_DRIVER: 'openai' }));
      expect(svc.getEmbeddingDimension()).toBe(1536);
    });

    it('returns openai-flavored default 1536 for gemini / ollama / openai-compatible (unchanged)', () => {
      for (const d of ['gemini', 'ollama', 'openai-compatible']) {
        const svc = new AiProviderService(buildEnv({ AI_DRIVER: d }));
        expect(svc.getEmbeddingDimension()).toBe(1536);
      }
    });

    it('honors AI_EMBEDDING_DIMENSION env override regardless of driver', () => {
      const svc = new AiProviderService(
        buildEnv({ AI_DRIVER: 'mistral', AI_EMBEDDING_DIMENSION: 768 }),
      );
      expect(svc.getEmbeddingDimension()).toBe(768);
    });

    it('falls back to openai default when driver is unset', () => {
      const svc = new AiProviderService(buildEnv({}));
      expect(svc.getEmbeddingDimension()).toBe(1536);
    });
  });

  describe('onModuleInit — mistral', () => {
    it('builds models with mistral defaults when AI_DRIVER=mistral and key is present', () => {
      const svc = new AiProviderService(
        buildEnv({ AI_DRIVER: 'mistral', MISTRAL_API_KEY: 'sk-test' }),
      );
      svc.onModuleInit();

      expect(createMistral).toHaveBeenCalledWith({ apiKey: 'sk-test' });
      expect(svc.isAvailable()).toBe(true);

      const factory = (createMistral as jest.Mock).mock.results[0].value;
      expect(factory.languageModel).toHaveBeenCalledWith('mistral-large-latest');
      expect(factory.textEmbeddingModel).toHaveBeenCalledWith('mistral-embed');
    });

    it('honors AI_*_MODEL overrides for mistral', () => {
      const svc = new AiProviderService(
        buildEnv({
          AI_DRIVER: 'mistral',
          MISTRAL_API_KEY: 'sk-test',
          AI_COMPLETION_MODEL: 'mistral-small-latest',
          AI_EMBEDDING_MODEL: 'mistral-embed-2',
        }),
      );
      svc.onModuleInit();

      const factory = (createMistral as jest.Mock).mock.results[0].value;
      expect(factory.languageModel).toHaveBeenCalledWith('mistral-small-latest');
      expect(factory.textEmbeddingModel).toHaveBeenCalledWith('mistral-embed-2');
    });

    it('logs a warning and leaves the service unavailable when MISTRAL_API_KEY is missing', () => {
      const svc = new AiProviderService(buildEnv({ AI_DRIVER: 'mistral' }));
      const errorSpy = jest
        .spyOn((svc as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
        .mockImplementation();

      svc.onModuleInit();

      expect(svc.isAvailable()).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('MISTRAL_API_KEY is required'),
      );
    });

    it('does not call other provider factories when driver=mistral', () => {
      const svc = new AiProviderService(
        buildEnv({ AI_DRIVER: 'mistral', MISTRAL_API_KEY: 'sk-test' }),
      );
      svc.onModuleInit();

      expect(createMistral).toHaveBeenCalledTimes(3); // completion + chat + embedding
      expect(createOpenAI).not.toHaveBeenCalled();
      expect(createGoogleGenerativeAI).not.toHaveBeenCalled();
      expect(createOllama).not.toHaveBeenCalled();
      expect(createOpenAICompatible).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit — existing drivers stay unchanged', () => {
    it('openai still uses openai factory and openai defaults', () => {
      const svc = new AiProviderService(
        buildEnv({ AI_DRIVER: 'openai', OPENAI_API_KEY: 'sk-openai' }),
      );
      svc.onModuleInit();

      expect(createOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-openai',
        baseURL: undefined,
      });
      expect(createMistral).not.toHaveBeenCalled();
      const factory = (createOpenAI as jest.Mock).mock.results[0].value;
      expect(factory.languageModel).toHaveBeenCalledWith('gpt-4o-mini');
      expect(factory.textEmbeddingModel).toHaveBeenCalledWith(
        'text-embedding-3-small',
      );
    });

    it('gemini still uses google factory', () => {
      const svc = new AiProviderService(
        buildEnv({ AI_DRIVER: 'gemini', GEMINI_API_KEY: 'g-test' }),
      );
      svc.onModuleInit();

      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'g-test' });
      expect(createMistral).not.toHaveBeenCalled();
    });

    it('ollama still uses ollama factory', () => {
      const svc = new AiProviderService(
        buildEnv({
          AI_DRIVER: 'ollama',
          OLLAMA_API_URL: 'http://localhost:11434',
        }),
      );
      svc.onModuleInit();

      expect(createOllama).toHaveBeenCalledWith({
        baseURL: 'http://localhost:11434',
      });
      expect(createMistral).not.toHaveBeenCalled();
    });

    it('openai-compatible still uses compatible factory', () => {
      const svc = new AiProviderService(
        buildEnv({
          AI_DRIVER: 'openai-compatible',
          OPENAI_API_KEY: 'k',
          OPENAI_API_URL: 'https://litellm.example/v1',
        }),
      );
      svc.onModuleInit();

      expect(createOpenAICompatible).toHaveBeenCalledWith({
        name: 'custom',
        apiKey: 'k',
        baseURL: 'https://litellm.example/v1',
      });
      expect(createMistral).not.toHaveBeenCalled();
    });
  });

  describe('503 surfaces — service unavailable', () => {
    it('generate() throws ServiceUnavailableException when not configured', async () => {
      const svc = new AiProviderService(buildEnv({}));
      await expect(svc.generate({ prompt: 'hi' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('embed() throws ServiceUnavailableException when not configured', async () => {
      const svc = new AiProviderService(buildEnv({}));
      await expect(svc.embed('hi')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('embedMany() throws ServiceUnavailableException when not configured', async () => {
      const svc = new AiProviderService(buildEnv({}));
      await expect(svc.embedMany(['a', 'b'])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('mistral with missing key leaves all surfaces 503 (not 500)', async () => {
      const svc = new AiProviderService(buildEnv({ AI_DRIVER: 'mistral' }));
      jest
        .spyOn(
          (svc as unknown as { logger: { error: (m: string) => void } })
            .logger,
          'error',
        )
        .mockImplementation();
      svc.onModuleInit();

      await expect(svc.generate({ prompt: 'hi' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(svc.embed('hi')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
