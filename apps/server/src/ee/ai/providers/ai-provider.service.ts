import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createMistral } from '@ai-sdk/mistral';
import { createOllama } from 'ai-sdk-ollama';
import {
  type EmbeddingModel,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type StopCondition,
  embed,
  embedMany,
  generateText,
  streamText,
} from 'ai';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

export type AiDriver =
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'openai-compatible'
  | 'mistral';

// streamText's full return type names internal generics that TS can't
// re-emit from this file. Aliasing keeps the public API typed without
// dragging the SDK's internal Output type into our .d.ts surface.
export type StreamTextResult = ReturnType<typeof streamText>;

type DriverDefaults = {
  completion: string;
  chat: string;
  embedding: string;
  dimension: number;
};

// Defaults are per-driver because each provider has its own model
// catalog. The historical OpenAI-flavored defaults stay the fallback
// for openai / gemini / ollama / openai-compatible — operators almost
// always override AI_*_MODEL anyway, and changing those defaults
// would be a behavior change for existing users. Mistral gets its
// own native defaults so AI_DRIVER=mistral with no other config
// boots into a sensible state.
const OPENAI_FLAVOR_DEFAULTS: DriverDefaults = {
  completion: 'gpt-4o-mini',
  chat: 'gpt-4o-mini',
  embedding: 'text-embedding-3-small',
  dimension: 1536,
};

const MISTRAL_DEFAULTS: DriverDefaults = {
  completion: 'mistral-large-latest',
  chat: 'mistral-large-latest',
  embedding: 'mistral-embed',
  dimension: 1024,
};

function defaultsForDriver(driver: AiDriver | null): DriverDefaults {
  return driver === 'mistral' ? MISTRAL_DEFAULTS : OPENAI_FLAVOR_DEFAULTS;
}

/**
 * AiProviderService is the EE single-entry-point to the LLM stack. Other AI
 * features (Ask AI, Answers, Chat, MCP) call the helpers here so provider
 * selection and credential handling live in exactly one place.
 *
 * Driver selection is env-driven (AI_DRIVER). Switching providers therefore
 * doesn't require code changes — just env updates and a restart. Supported
 * drivers: openai, gemini, mistral, ollama, openai-compatible (LiteLLM,
 * Azure OpenAI, vLLM, etc.). ConqrHub's documented default for new
 * deployments is mistral; openai remains fully supported.
 */
@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);
  private completionModel: LanguageModel | null = null;
  private chatModel: LanguageModel | null = null;
  private embeddingModel: EmbeddingModel | null = null;

  constructor(private readonly env: EnvironmentService) {}

  onModuleInit(): void {
    const driver = this.getDriver();
    if (!driver) {
      this.logger.warn(
        'AI_DRIVER not set — AI features will return 503 until configured',
      );
      return;
    }
    try {
      this.completionModel = this.buildCompletionModel(driver);
      this.chatModel = this.buildChatModel(driver);
      this.embeddingModel = this.buildEmbeddingModel(driver);
      this.logger.log(`AI provider initialised: driver=${driver}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`Failed to initialise AI provider: ${message}`);
    }
  }

  getDriver(): AiDriver | null {
    const raw = this.env.getAiDriver();
    if (!raw) return null;
    const normalised = raw.trim().toLowerCase();
    if (
      normalised === 'openai' ||
      normalised === 'gemini' ||
      normalised === 'ollama' ||
      normalised === 'openai-compatible' ||
      normalised === 'mistral'
    ) {
      return normalised;
    }
    this.logger.warn(`Unknown AI_DRIVER "${raw}" — falling back to openai`);
    return 'openai';
  }

  isAvailable(): boolean {
    return this.completionModel !== null;
  }

  getEmbeddingDimension(): number {
    const dim = this.env.getAiEmbeddingDimension();
    if (Number.isFinite(dim) && dim > 0) return dim;
    return defaultsForDriver(this.getDriver()).dimension;
  }

  /**
   * Run a one-shot completion. Throws ServiceUnavailableException if AI is
   * not configured — controllers convert that to a 503.
   */
  async generate(args: {
    system?: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<{ text: string; usage?: { totalTokens?: number } }> {
    const model = this.requireCompletionModel();
    const result = await generateText({
      model,
      system: args.system,
      prompt: args.prompt,
      temperature: args.temperature ?? 0.7,
      maxOutputTokens: args.maxOutputTokens,
    });
    return { text: result.text, usage: result.usage };
  }

  /**
   * Stream a completion. Returns the AI SDK stream — caller pipes into SSE.
   */
  stream(args: {
    system?: string;
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): StreamTextResult {
    const model = this.requireCompletionModel();
    return streamText({
      model,
      system: args.system,
      prompt: args.prompt,
      temperature: args.temperature ?? 0.7,
      maxOutputTokens: args.maxOutputTokens,
    });
  }

  /**
   * Multi-turn chat with optional tool support. Uses the dedicated chatModel
   * (falls back to completionModel when AI_CHAT_MODEL is not set separately).
   * Supports multi-step loops via `stopWhen: stepCountIs(N)`.
   */
  chat(args: {
    messages: ModelMessage[];
    system?: string;
    tools?: ToolSet;
    temperature?: number;
    maxOutputTokens?: number;
    stopWhen?: StopCondition<any>;
  }): StreamTextResult {
    const model = this.requireChatModel();
    return streamText({
      model,
      messages: args.messages,
      system: args.system,
      tools: args.tools,
      temperature: args.temperature ?? 0.5,
      maxOutputTokens: args.maxOutputTokens,
      stopWhen: args.stopWhen,
    });
  }

  async embed(text: string): Promise<number[]> {
    const model = this.requireEmbeddingModel();
    const { embedding } = await embed({ model, value: text });
    return embedding;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const model = this.requireEmbeddingModel();
    const { embeddings } = await embedMany({ model, values: texts });
    return embeddings;
  }

  private buildCompletionModel(driver: AiDriver): LanguageModel {
    const modelId =
      this.env.getAiCompletionModel() || defaultsForDriver(driver).completion;
    return this.providerFor(driver).languageModel(modelId);
  }

  private buildChatModel(driver: AiDriver): LanguageModel {
    const modelId =
      this.env.getAiChatModel() ||
      this.env.getAiCompletionModel() ||
      defaultsForDriver(driver).chat;
    return this.providerFor(driver).languageModel(modelId);
  }

  private buildEmbeddingModel(driver: AiDriver): EmbeddingModel {
    const modelId =
      this.env.getAiEmbeddingModel() || defaultsForDriver(driver).embedding;
    return this.providerFor(driver).textEmbeddingModel(modelId);
  }

  // The four providers expose nearly-identical factory shapes thanks to
  // the AI SDK. Each returns an object with .languageModel() and
  // .textEmbeddingModel() — we normalise to that shape here.
  private providerFor(driver: AiDriver): {
    languageModel: (id: string) => LanguageModel;
    textEmbeddingModel: (id: string) => EmbeddingModel;
  } {
    if (driver === 'openai') {
      const apiKey = this.env.getOpenAiApiKey();
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required when AI_DRIVER=openai');
      }
      const baseURL = this.env.getOpenAiApiUrl() || undefined;
      return createOpenAI({ apiKey, baseURL });
    }
    if (driver === 'gemini') {
      const apiKey = this.env.getGeminiApiKey();
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY is required when AI_DRIVER=gemini');
      }
      return createGoogleGenerativeAI({ apiKey });
    }
    if (driver === 'ollama') {
      const baseURL = this.env.getOllamaApiUrl();
      return createOllama({ baseURL });
    }
    if (driver === 'mistral') {
      const apiKey = this.env.getMistralApiKey();
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is required when AI_DRIVER=mistral');
      }
      return createMistral({ apiKey });
    }
    // openai-compatible: LiteLLM, Azure OpenAI, vLLM, etc.
    const apiKey = this.env.getOpenAiApiKey();
    const baseURL = this.env.getOpenAiApiUrl();
    if (!baseURL) {
      throw new Error(
        'OPENAI_API_URL is required when AI_DRIVER=openai-compatible',
      );
    }
    return createOpenAICompatible({
      name: 'custom',
      apiKey,
      baseURL,
    });
  }

  private requireCompletionModel(): LanguageModel {
    if (!this.completionModel) {
      throw new ServiceUnavailableException(
        'AI provider is not configured. Set AI_DRIVER and provider credentials.',
      );
    }
    return this.completionModel;
  }

  private requireChatModel(): LanguageModel {
    if (!this.chatModel) {
      throw new ServiceUnavailableException(
        'AI provider is not configured. Set AI_DRIVER and provider credentials.',
      );
    }
    return this.chatModel;
  }

  private requireEmbeddingModel(): EmbeddingModel {
    if (!this.embeddingModel) {
      throw new ServiceUnavailableException(
        'AI embedding provider is not configured.',
      );
    }
    return this.embeddingModel;
  }
}
