# Mistral Voice Input (STT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `<MicButton/>` to the AI Chat input, the editor Ask-AI menu, the Search spotlight, and the page editor (via slash command). Recording uploads to a new server endpoint that transcribes via Mistral Voxtral Small and runs a context-aware correction pass via `mistral-large-latest`. Corrected text drops into the existing input for the user to review and submit.

**Architecture:** Frontend `MediaRecorder` → `multipart/form-data` POST to `/api/ai/stt` → server fetches `https://api.mistral.ai/v1/audio/transcriptions` (Voxtral Small) → resolves page/chat context server-side → second pass via existing `AiProviderService.generate()` → returns `{ raw, corrected }`. Workspace toggle `settings.ai.stt` + env `AI_STT_ENABLED` both gate the feature. No new credentials — reuses `MISTRAL_API_KEY`.

**Tech Stack:** NestJS (Fastify), Kysely, Jest, React, Mantine, Jotai, TanStack Query, Tiptap, MediaRecorder API.

**Spec:** [docs/superpowers/specs/2026-05-19-mistral-voice-input-design.md](../specs/2026-05-19-mistral-voice-input-design.md).

---

## Task 0: Pre-flight

**Files:** none — verification only.

- [ ] **Step 0.1: Verify current branch is clean enough to start**

Run: `git status --short`
Expected: pre-existing modifications in `apps/client/...` and `apps/server/...` (already present at session start, unrelated to this work). Note them; do not stage them. We will only touch files this plan lists.

- [ ] **Step 0.2: Verify `MISTRAL_API_KEY` env-var helper exists**

Run: `grep -n "getMistralApiKey" apps/server/src/integrations/environment/environment.service.ts`
Expected: one match around line 291.

---

## Task 1: Add `stt` to the AI feature toggle constants

**Files:**
- Modify: `apps/server/src/ee/ai/feature.constants.ts`

- [ ] **Step 1.1: Add `'stt'` to the `AiFeature` union and defaults**

Edit `apps/server/src/ee/ai/feature.constants.ts`:

```ts
/**
 * Per-surface workspace toggles for the AI subsystem. Stored under
 * workspace.settings.ai = { generative, search, chat, mcp, stt }. Admins can
 * disable any surface independently — defaults are documented per
 * surface in docs/architecture/ai-subsystem.md.
 */
export type AiFeature = 'generative' | 'retrieval' | 'search' | 'chat' | 'mcp' | 'stt';

export const AI_FEATURE_DEFAULTS: Record<AiFeature, boolean> = {
  generative: true,
  retrieval: true,
  search: true,
  chat: true,
  mcp: false,
  stt: true,
};

export const AI_FEATURE_KEY = 'aiFeature';
```

- [ ] **Step 1.2: Confirm typecheck**

Run from `apps/server`: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors (or only the pre-existing errors from unrelated files in the working tree).

- [ ] **Step 1.3: Commit**

```bash
git add apps/server/src/ee/ai/feature.constants.ts
git commit -m "feat(ai): add 'stt' to AI feature toggle constants"
```

---

## Task 2: Add `getAiSttEnabled` / `getAiSttModel` env helpers

**Files:**
- Modify: `apps/server/src/integrations/environment/environment.service.ts`

- [ ] **Step 2.1: Add the two helpers near the other AI helpers**

Edit `apps/server/src/integrations/environment/environment.service.ts`. After `getMistralApiKey()` (around line 293), add:

```ts
  getAiSttEnabled(): boolean {
    const raw = this.configService.get<string>('AI_STT_ENABLED');
    if (raw == null || raw === '') {
      // Default: enabled when a Mistral key is configured.
      return Boolean(this.configService.get<string>('MISTRAL_API_KEY'));
    }
    return !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
  }

  getAiSttModel(): string {
    return (
      this.configService.get<string>('AI_STT_MODEL') ||
      'voxtral-small-2507'
    );
  }
```

- [ ] **Step 2.2: Commit**

```bash
git add apps/server/src/integrations/environment/environment.service.ts
git commit -m "feat(ai): add AI_STT_ENABLED and AI_STT_MODEL env helpers"
```

---

## Task 3: Create SttService — failing tests

**Files:**
- Create: `apps/server/src/ee/ai/stt/stt.service.spec.ts`

- [ ] **Step 3.1: Write the failing test file**

Create `apps/server/src/ee/ai/stt/stt.service.spec.ts`:

```ts
import { SttService } from './stt.service';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const envMock = {
  getMistralApiKey: jest.fn(() => 'sk-test'),
  getAiSttEnabled: jest.fn(() => true),
  getAiSttModel: jest.fn(() => 'voxtral-small-2507'),
};

const providerMock = {
  generate: jest.fn(async () => ({ text: 'Corrected transcript.' })),
};

const pageRepoMock = {
  findById: jest.fn(),
};

function makeService() {
  return new SttService(envMock as any, providerMock as any, pageRepoMock as any);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SttService.transcribeAndCorrect', () => {
  const audio = Buffer.from('fake-audio-bytes');

  it('happy path: returns raw + corrected', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw transcript' }),
    });

    const result = await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.mistral.ai/v1/audio/transcriptions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.raw).toBe('raw transcript');
    expect(result.corrected).toBe('Corrected transcript.');
    expect(result.model).toBe('voxtral-small-2507');
    expect(typeof result.durationMs).toBe('number');
    expect(providerMock.generate).toHaveBeenCalledTimes(1);
  });

  it('falls back to raw when correction throws', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw text' }),
    });
    providerMock.generate.mockRejectedValueOnce(new Error('boom'));

    const result = await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(result.raw).toBe('raw text');
    expect(result.corrected).toBe('raw text');
  });

  it('returns empty corrected when raw is empty (no LLM call)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: '' }),
    });

    const result = await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(result.raw).toBe('');
    expect(result.corrected).toBe('');
    expect(providerMock.generate).not.toHaveBeenCalled();
  });

  it('throws when Mistral returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'server error',
    });

    await expect(
      makeService().transcribeAndCorrect(
        audio,
        'audio/webm',
        { kind: 'search' },
        'workspace-id',
        'Acme Wiki',
      ),
    ).rejects.toThrow(/transcription failed/i);
    expect(providerMock.generate).not.toHaveBeenCalled();
  });

  it('resolves page title for kind=page and includes it in correction prompt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'lets discuss voxtral migration' }),
    });
    pageRepoMock.findById.mockResolvedValueOnce({
      id: 'page-id',
      title: 'Voxtral Migration Plan',
      textContent: 'Some surrounding text about Voxtral migration steps.',
      workspaceId: 'workspace-id',
    });

    await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'page', pageId: 'page-id' },
      'workspace-id',
      'Acme Wiki',
    );

    const call = providerMock.generate.mock.calls[0][0];
    expect(call.prompt).toContain('Voxtral Migration Plan');
    expect(call.prompt).toContain('lets discuss voxtral migration');
    expect(call.temperature).toBeLessThanOrEqual(0.2);
  });

  it('rejects when page belongs to a different workspace', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw' }),
    });
    pageRepoMock.findById.mockResolvedValueOnce({
      id: 'page-id',
      title: 'Other workspace page',
      textContent: '',
      workspaceId: 'someone-else',
    });

    await expect(
      makeService().transcribeAndCorrect(
        audio,
        'audio/webm',
        { kind: 'page', pageId: 'page-id' },
        'workspace-id',
        'Acme Wiki',
      ),
    ).rejects.toThrow(/forbidden|workspace/i);
  });

  it('skips page lookup for kind=search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ text: 'raw' }),
    });

    await makeService().transcribeAndCorrect(
      audio,
      'audio/webm',
      { kind: 'search' },
      'workspace-id',
      'Acme Wiki',
    );

    expect(pageRepoMock.findById).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run tests, confirm they fail (no SttService yet)**

Run from `apps/server`: `pnpm exec jest src/ee/ai/stt/stt.service.spec.ts`
Expected: FAIL with "Cannot find module './stt.service'".

---

## Task 4: Create SttService — implementation

**Files:**
- Create: `apps/server/src/ee/ai/stt/stt.service.ts`

- [ ] **Step 4.1: Implement the service**

Create `apps/server/src/ee/ai/stt/stt.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { AiProviderService } from '../providers/ai-provider.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';

export type SttContextKind = 'chat' | 'ask-ai' | 'search' | 'page';

export type SttContext = {
  kind: SttContextKind;
  pageId?: string;
  chatId?: string;
  mentionPageIds?: string[];
};

export type SttResult = {
  raw: string;
  corrected: string;
  model: string;
  durationMs: number;
};

const CORRECTION_SYSTEM = [
  'You correct speech-to-text transcripts.',
  'Fix punctuation, capitalization, and obvious mishearings.',
  'Preserve the speaker\'s wording — do not paraphrase, summarize, translate, or add content.',
  'Output only the corrected transcript, no preamble or explanation.',
].join(' ');

const MAX_EXCERPT_CHARS = 500;

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);

  constructor(
    private readonly env: EnvironmentService,
    private readonly provider: AiProviderService,
    private readonly pageRepo: PageRepo,
  ) {}

  async transcribeAndCorrect(
    audio: Buffer,
    mime: string,
    context: SttContext,
    workspaceId: string,
    workspaceName: string,
  ): Promise<SttResult> {
    const apiKey = this.env.getMistralApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('Mistral API key not configured');
    }
    const model = this.env.getAiSttModel();
    const started = Date.now();

    const raw = await this.transcribe(audio, mime, model, apiKey);

    if (!raw.trim()) {
      return { raw, corrected: raw, model, durationMs: Date.now() - started };
    }

    const corrected = await this.correct(raw, context, workspaceId, workspaceName);

    return { raw, corrected, model, durationMs: Date.now() - started };
  }

  private async transcribe(
    audio: Buffer,
    mime: string,
    model: string,
    apiKey: string,
  ): Promise<string> {
    const form = new FormData();
    const blob = new Blob([audio], { type: mime || 'audio/webm' });
    form.append('file', blob, `recording.${mime.split('/')[1] || 'webm'}`);
    form.append('model', model);

    const res = await fetch(
      'https://api.mistral.ai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form as any,
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Mistral transcription failed: ${res.status} ${body}`);
      throw new ServiceUnavailableException('Transcription failed');
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? '').trim();
  }

  private async correct(
    raw: string,
    context: SttContext,
    workspaceId: string,
    workspaceName: string,
  ): Promise<string> {
    let pageTitle = '';
    let excerpt = '';

    if (
      (context.kind === 'page' || context.kind === 'ask-ai') &&
      context.pageId
    ) {
      const page = await this.pageRepo.findById(context.pageId, {
        includeTextContent: true,
      });
      if (!page) {
        throw new ForbiddenException('Page not found');
      }
      if (page.workspaceId !== workspaceId) {
        throw new ForbiddenException('Page not in this workspace');
      }
      pageTitle = page.title ?? '';
      excerpt = (page.textContent ?? '').slice(0, MAX_EXCERPT_CHARS);
    }

    const properNouns = [workspaceName, pageTitle].filter(Boolean).join(', ');
    const prompt = [
      properNouns
        ? `Proper nouns to preserve verbatim: ${properNouns}.`
        : '',
      excerpt ? `Nearby text: "${excerpt}"` : '',
      `Raw transcript: "${raw}"`,
      '',
      'Return only the corrected transcript.',
    ]
      .filter(Boolean)
      .join('\n');

    const wordCount = raw.split(/\s+/).length;
    const maxOutputTokens = Math.max(64, Math.ceil(wordCount * 3));

    try {
      const result = await this.provider.generate({
        system: CORRECTION_SYSTEM,
        prompt,
        temperature: 0.1,
        maxOutputTokens,
      });
      return (result.text ?? '').trim() || raw;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`Correction pass failed, falling back to raw: ${msg}`);
      return raw;
    }
  }
}
```

- [ ] **Step 4.2: Run tests, confirm all pass**

Run from `apps/server`: `pnpm exec jest src/ee/ai/stt/stt.service.spec.ts`
Expected: all 7 tests PASS.

- [ ] **Step 4.3: Commit**

```bash
git add apps/server/src/ee/ai/stt/stt.service.ts apps/server/src/ee/ai/stt/stt.service.spec.ts
git commit -m "feat(ai): add SttService for Voxtral transcription + correction"
```

---

## Task 5: Create SttController

**Files:**
- Create: `apps/server/src/ee/ai/stt/dto/stt-context.dto.ts`
- Create: `apps/server/src/ee/ai/stt/stt.controller.ts`

- [ ] **Step 5.1: Create the context DTO**

Create `apps/server/src/ee/ai/stt/dto/stt-context.dto.ts`:

```ts
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';

export class SttContextDto {
  @IsString()
  @IsIn(['chat', 'ask-ai', 'search', 'page'])
  kind!: 'chat' | 'ask-ai' | 'search' | 'page';

  @IsOptional()
  @IsUUID()
  pageId?: string;

  @IsOptional()
  @IsString()
  chatId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  mentionPageIds?: string[];
}
```

- [ ] **Step 5.2: Create the controller**

Create `apps/server/src/ee/ai/stt/stt.controller.ts`:

```ts
import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { SttService, SttContext } from './stt.service';
import { SttContextDto } from './dto/stt-context.dto';

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
]);

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('stt')
@Controller('ai')
export class SttController {
  private readonly logger = new Logger(SttController.name);

  constructor(
    private readonly stt: SttService,
    private readonly env: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('stt')
  async transcribe(
    @Req() req: FastifyRequest & { file: (opts?: unknown) => any },
    @AuthUser() _user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (!this.env.getAiSttEnabled()) {
      throw new ServiceUnavailableException({
        code: 'STT_DISABLED',
        message: 'Speech-to-text is disabled',
      });
    }

    if (!(req as any).isMultipart()) {
      throw new BadRequestException('Expected multipart/form-data');
    }

    let fileData: any;
    try {
      fileData = await (req as any).file({
        limits: { fileSize: MAX_AUDIO_BYTES, fields: 4, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException('Audio too large (max 5MB)');
      }
      throw new BadRequestException('Failed to process audio upload');
    }

    if (!fileData) {
      throw new BadRequestException('No audio file provided');
    }

    const mime = (fileData.mimetype ?? '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new UnsupportedMediaTypeException(`Unsupported audio mime: ${mime}`);
    }

    const buffer: Buffer = await fileData.toBuffer();
    if (buffer.length === 0) {
      throw new BadRequestException('Empty audio file');
    }

    const rawContext = fileData.fields?.context?.value;
    let context: SttContext;
    try {
      const parsed =
        typeof rawContext === 'string' ? JSON.parse(rawContext) : rawContext;
      const dto = plainToInstance(SttContextDto, parsed);
      const errs = validateSync(dto, { whitelist: true });
      if (errs.length > 0) {
        throw new BadRequestException('Invalid context payload');
      }
      context = dto;
    } catch {
      throw new BadRequestException('Invalid context payload');
    }

    const result = await this.stt.transcribeAndCorrect(
      buffer,
      mime,
      context,
      workspace.id,
      workspace.name ?? '',
    );

    this.logger.log(
      `STT ok user=${_user.id} ws=${workspace.id} kind=${context.kind} bytes=${buffer.length} ms=${result.durationMs}`,
    );

    return result;
  }
}
```

- [ ] **Step 5.3: Confirm typecheck**

Run from `apps/server`: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no new errors in the files touched by this plan.

- [ ] **Step 5.4: Commit**

```bash
git add apps/server/src/ee/ai/stt/dto/stt-context.dto.ts apps/server/src/ee/ai/stt/stt.controller.ts
git commit -m "feat(ai): add SttController POST /api/ai/stt"
```

---

## Task 6: Wire SttModule into AiModule

**Files:**
- Create: `apps/server/src/ee/ai/stt/stt.module.ts`
- Modify: `apps/server/src/ee/ai/ai.module.ts`

- [ ] **Step 6.1: Create SttModule**

Create `apps/server/src/ee/ai/stt/stt.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../../integrations/environment/environment.module';
import { AiProviderModule } from '../providers/ai-provider.module';
import { SttController } from './stt.controller';
import { SttService } from './stt.service';
// PageRepo is registered globally via DatabaseModule; no local provider needed.

@Module({
  imports: [EnvironmentModule, AiProviderModule],
  controllers: [SttController],
  providers: [SttService],
})
export class SttModule {}
```

- [ ] **Step 6.2: Register in AiModule**

Edit `apps/server/src/ee/ai/ai.module.ts` — add the `SttModule` import:

```ts
import { Module } from '@nestjs/common';
import { EnvironmentModule } from '../../integrations/environment/environment.module';
import { AiProviderModule } from './providers/ai-provider.module';
import { AiGenerateService } from './generate/ai-generate.service';
import { AiGenerateController } from './generate/ai-generate.controller';
import { WorkspaceAiToggleGuard } from './guards/workspace-ai-toggle.guard';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { RagModule } from './rag/rag.module';
import { AiChatModule } from './chat/ai-chat.module';
import { McpModule } from './mcp/mcp.module';
import { SttModule } from './stt/stt.module';

@Module({
  imports: [
    EnvironmentModule,
    AiProviderModule,
    EmbeddingsModule,
    RagModule,
    AiChatModule,
    McpModule,
    SttModule,
  ],
  controllers: [AiGenerateController],
  providers: [AiGenerateService, WorkspaceAiToggleGuard],
  exports: [AiProviderModule],
})
export class AiModule {}
```

- [ ] **Step 6.3: Confirm server boots**

Run from `apps/server`: `pnpm exec nest build`
Expected: build succeeds. (Do not start the dev server yet — we'll smoke-test it after the client side is wired.)

- [ ] **Step 6.4: Commit**

```bash
git add apps/server/src/ee/ai/stt/stt.module.ts apps/server/src/ee/ai/ai.module.ts
git commit -m "feat(ai): register SttModule in AiModule"
```

---

## Task 7: Workspace admin toggle (server)

**Files:**
- Modify: `apps/server/src/core/workspace/dto/update-workspace.dto.ts`
- Modify: `apps/server/src/core/workspace/services/workspace.service.ts`

- [ ] **Step 7.1: Add `aiStt` to the update DTO**

Edit `apps/server/src/core/workspace/dto/update-workspace.dto.ts` — add the field next to `aiChat`:

```ts
  @IsOptional()
  @IsBoolean()
  aiChat: boolean;

  @IsOptional()
  @IsBoolean()
  aiStt: boolean;
```

- [ ] **Step 7.2: Handle `aiStt` in workspace.service.ts**

Edit `apps/server/src/core/workspace/services/workspace.service.ts`. After the `aiChat` block (around line 491), insert the same shape for `aiStt`. Reference: the existing `aiChat` block reads from `settingsBefore?.ai?.chat` and writes via `updateAiSettings(workspaceId, 'chat', ...)`. Repeat for `stt`:

```ts
      if (typeof updateWorkspaceDto.aiStt !== 'undefined') {
        const prev = settingsBefore?.ai?.stt ?? true;
        if (prev !== updateWorkspaceDto.aiStt) {
          before.aiStt = prev;
          after.aiStt = updateWorkspaceDto.aiStt;
        }
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'stt',
          updateWorkspaceDto.aiStt,
          trx,
        );
      }
```

Then add `delete updateWorkspaceDto.aiStt;` next to the other deletes (around line 499).

- [ ] **Step 7.3: Confirm typecheck and build**

Run from `apps/server`: `pnpm exec nest build`
Expected: build succeeds.

- [ ] **Step 7.4: Commit**

```bash
git add apps/server/src/core/workspace/dto/update-workspace.dto.ts apps/server/src/core/workspace/services/workspace.service.ts
git commit -m "feat(workspace): admin toggle aiStt for STT"
```

---

## Task 8: Client workspace types

**Files:**
- Modify: `apps/client/src/features/workspace/types/workspace.types.ts`

- [ ] **Step 8.1: Add `stt?: boolean` to `IWorkspaceAiSettings` and `aiStt?: boolean` to `IWorkspace`**

Edit `apps/client/src/features/workspace/types/workspace.types.ts`:

```ts
export interface IWorkspace {
  // ...existing fields...
  aiSearch?: boolean;
  generativeAi?: boolean;
  disablePublicSharing?: boolean;
  mcpEnabled?: boolean;
  trashRetentionDays?: number;
  restrictApiToAdmins?: boolean;
  allowMemberTemplates?: boolean;
  aiStt?: boolean;
}

export interface IWorkspaceAiSettings {
  search?: boolean;
  generative?: boolean;
  mcp?: boolean;
  chat?: boolean;
  stt?: boolean;
}
```

- [ ] **Step 8.2: Commit**

```bash
git add apps/client/src/features/workspace/types/workspace.types.ts
git commit -m "feat(workspace): client type for aiStt toggle"
```

---

## Task 9: Client — voice-input types

**Files:**
- Create: `apps/client/src/ee/voice-input/types.ts`

- [ ] **Step 9.1: Create the types module**

Create `apps/client/src/ee/voice-input/types.ts`:

```ts
export type SttContextKind = "chat" | "ask-ai" | "search" | "page";

export interface SttContext {
  kind: SttContextKind;
  pageId?: string;
  chatId?: string;
  mentionPageIds?: string[];
}

export interface SttResult {
  raw: string;
  corrected: string;
  model: string;
  durationMs: number;
}

export type RecordingState = "idle" | "recording" | "transcribing" | "error";
```

- [ ] **Step 9.2: Commit**

```bash
git add apps/client/src/ee/voice-input/types.ts
git commit -m "feat(voice-input): types module"
```

---

## Task 10: Client — useVoiceInput hook

**Files:**
- Create: `apps/client/src/ee/voice-input/use-voice-input.ts`

- [ ] **Step 10.1: Implement the hook**

Create `apps/client/src/ee/voice-input/use-voice-input.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecordingState } from "./types";

const MAX_DURATION_MS = 60_000;

interface Options {
  onComplete: (blob: Blob, mime: string) => void;
  onError?: (err: Error) => void;
  onAutoStop?: () => void;
}

export function useVoiceInput({ onComplete, onError, onAutoStop }: Options) {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current !== null) {
      window.clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const wasCancelled = cancelledRef.current;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        cleanup();
        setElapsedMs(0);
        if (wasCancelled || blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        onComplete(blob, "audio/webm");
      };

      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
      autoStopRef.current = window.setTimeout(() => {
        onAutoStop?.();
        try { recorder.stop(); } catch {}
      }, MAX_DURATION_MS);
    } catch (err) {
      cleanup();
      setState("error");
      onError?.(err instanceof Error ? err : new Error("Recording failed"));
      setState("idle");
    }
  }, [state, onComplete, onError, onAutoStop, cleanup]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r || state !== "recording") return;
    try { r.stop(); } catch {}
  }, [state]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") {
      try { r.stop(); } catch {}
    } else {
      cleanup();
      setState("idle");
      setElapsedMs(0);
    }
  }, [cleanup]);

  const finishTranscribing = useCallback(() => setState("idle"), []);

  useEffect(() => cleanup, [cleanup]);

  return { state, elapsedMs, start, stop, cancel, finishTranscribing };
}

export function isVoiceInputSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}
```

- [ ] **Step 10.2: Commit**

```bash
git add apps/client/src/ee/voice-input/use-voice-input.ts
git commit -m "feat(voice-input): useVoiceInput hook"
```

---

## Task 11: Client — stt-service

**Files:**
- Create: `apps/client/src/ee/voice-input/stt-service.ts`

- [ ] **Step 11.1: Implement the service**

Create `apps/client/src/ee/voice-input/stt-service.ts`:

```ts
import api from "@/lib/api-client";
import type { SttContext, SttResult } from "./types";

export async function transcribeAudio(
  audio: Blob,
  context: SttContext,
): Promise<SttResult> {
  const form = new FormData();
  form.append("file", audio, "recording.webm");
  form.append("context", JSON.stringify(context));

  const res = await api.post<SttResult>("/ai/stt", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}
```

- [ ] **Step 11.2: Commit**

```bash
git add apps/client/src/ee/voice-input/stt-service.ts
git commit -m "feat(voice-input): client stt-service"
```

---

## Task 12: Client — MicButton component

**Files:**
- Create: `apps/client/src/ee/voice-input/mic-button.module.css`
- Create: `apps/client/src/ee/voice-input/mic-button.tsx`

- [ ] **Step 12.1: Create the CSS module**

Create `apps/client/src/ee/voice-input/mic-button.module.css`:

```css
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: transparent;
  border: 1px solid var(--mantine-color-gray-4);
  color: var(--mantine-color-gray-7);
  border-radius: 999px;
  padding: 4px 10px;
  height: 28px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.button:hover:not(:disabled) {
  background: var(--mantine-color-gray-1);
  color: var(--mantine-color-gray-9);
}

.button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recording {
  background: var(--mantine-color-red-1);
  border-color: var(--mantine-color-red-5);
  color: var(--mantine-color-red-7);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mantine-color-red-6);
  animation: pulse 1.1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

.timer {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.transcribing {
  background: var(--mantine-color-gray-1);
  color: var(--mantine-color-gray-7);
}
```

- [ ] **Step 12.2: Create the component**

Create `apps/client/src/ee/voice-input/mic-button.tsx`:

```tsx
import { useCallback, useMemo } from "react";
import { IconMicrophone, IconX, IconLoader2 } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useVoiceInput, isVoiceInputSupported } from "./use-voice-input";
import { transcribeAudio } from "./stt-service";
import type { SttContext } from "./types";
import classes from "./mic-button.module.css";

interface Props {
  context: SttContext;
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MicButton({ context, onTranscript, disabled, className }: Props) {
  const { t } = useTranslation();
  const hasAi = useHasFeature(Feature.AI);
  const workspace = useAtomValue(workspaceAtom);
  const sttEnabled = workspace?.settings?.ai?.stt ?? true;
  const supported = useMemo(() => isVoiceInputSupported(), []);

  const handleComplete = useCallback(
    async (blob: Blob) => {
      try {
        const result = await transcribeAudio(blob, context);
        const text = (result.corrected || result.raw || "").trim();
        if (text) onTranscript(text);
        else
          notifications.show({
            color: "yellow",
            message: t("No speech detected."),
          });
      } catch (err: any) {
        notifications.show({
          color: "red",
          title: t("Transcription failed"),
          message: err?.response?.data?.message ?? t("Please try again."),
        });
      } finally {
        finishTranscribing();
      }
    },
    [context, onTranscript, t],
  );

  const handleError = useCallback(
    (err: Error) => {
      const isPerm =
        err.name === "NotAllowedError" || err.message.includes("Permission");
      notifications.show({
        color: "red",
        title: isPerm ? t("Microphone access denied") : t("Recording failed"),
        message: isPerm
          ? t("Enable microphone access in your browser settings.")
          : err.message,
      });
    },
    [t],
  );

  const handleAutoStop = useCallback(() => {
    notifications.show({
      color: "yellow",
      message: t("Recording stopped at 60-second limit."),
    });
  }, [t]);

  const { state, elapsedMs, start, stop, cancel, finishTranscribing } =
    useVoiceInput({
      onComplete: handleComplete,
      onError: handleError,
      onAutoStop: handleAutoStop,
    });

  if (!hasAi || !sttEnabled || !supported) return null;

  if (state === "recording") {
    return (
      <div className={className} style={{ display: "inline-flex", gap: 4 }}>
        <button
          type="button"
          className={`${classes.button} ${classes.recording}`}
          onClick={stop}
          aria-label={t("Stop recording")}
        >
          <span className={classes.dot} />
          <span className={classes.timer}>{formatElapsed(elapsedMs)}</span>
        </button>
        <button
          type="button"
          className={classes.button}
          onClick={cancel}
          aria-label={t("Cancel recording")}
        >
          <IconX size={14} />
        </button>
      </div>
    );
  }

  if (state === "transcribing") {
    return (
      <button
        type="button"
        className={`${classes.button} ${classes.transcribing} ${className ?? ""}`}
        disabled
        aria-label={t("Transcribing")}
      >
        <IconLoader2 size={14} className="mantine-loader" />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`${classes.button} ${className ?? ""}`}
      onClick={start}
      disabled={disabled}
      aria-label={t("Record voice")}
      title={t("Record voice")}
    >
      <IconMicrophone size={14} />
    </button>
  );
}
```

- [ ] **Step 12.3: Confirm client builds**

Run from repo root: `pnpm exec tsc --noEmit -p apps/client/tsconfig.json`
Expected: no errors in the new files.

- [ ] **Step 12.4: Commit**

```bash
git add apps/client/src/ee/voice-input/mic-button.tsx apps/client/src/ee/voice-input/mic-button.module.css
git commit -m "feat(voice-input): MicButton component"
```

---

## Task 13: Admin toggle component (client)

**Files:**
- Create: `apps/client/src/ee/voice-input/components/enable-ai-stt.tsx`
- Modify: `apps/client/src/ee/ai/pages/ai-settings.tsx`

- [ ] **Step 13.1: Create the toggle**

Create `apps/client/src/ee/voice-input/components/enable-ai-stt.tsx`:

```tsx
import { Group, Text, Switch, Tooltip } from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";

export default function EnableAiStt() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(
    workspace?.settings?.ai?.stt ?? true,
  );
  const hasAccess = useHasFeature(Feature.AI);
  const upgradeLabel = useUpgradeLabel(4);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    try {
      const updated = await updateWorkspace({ aiStt: value } as any);
      setChecked(value);
      setWorkspace(updated);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Voice input (Speech-to-Text)")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Allow users to dictate into AI Chat, Ask AI, Search, and the page editor. Uses Mistral Voxtral for transcription with a context-aware correction pass.",
          )}
        </Text>
      </div>

      <Tooltip label={upgradeLabel} disabled={hasAccess} refProp="rootRef">
        <Switch
          defaultChecked={checked}
          onChange={handleChange}
          disabled={!hasAccess}
        />
      </Tooltip>
    </Group>
  );
}
```

- [ ] **Step 13.2: Mount it on the AI settings page**

Edit `apps/client/src/ee/ai/pages/ai-settings.tsx`:

```tsx
import EnableAiStt from "@/ee/voice-input/components/enable-ai-stt.tsx";
```

Inside the `<Stack gap="md">` block:

```tsx
          <Stack gap="md">
            {!isCloud() && <EnableAiSearch />}
            <EnableGenerativeAi />
            <EnableAiChat />
            <EnableAiStt />
          </Stack>
```

- [ ] **Step 13.3: Commit**

```bash
git add apps/client/src/ee/voice-input/components/enable-ai-stt.tsx apps/client/src/ee/ai/pages/ai-settings.tsx
git commit -m "feat(voice-input): admin toggle EnableAiStt on AI settings page"
```

---

## Task 14: Integrate into AI Chat input

**Files:**
- Modify: `apps/client/src/ee/ai-chat/components/chat-input.tsx`

- [ ] **Step 14.1: Wire MicButton next to the plus button**

Edit `apps/client/src/ee/ai-chat/components/chat-input.tsx`. Add the import near the top:

```tsx
import { MicButton } from "@/ee/voice-input/mic-button";
```

Inside `<div className={classes.actions}>` (after the Popover and before the `<div style={{ flex: 1 }} />` spacer), add:

```tsx
        <MicButton
          context={{
            kind: "chat",
            chatId: chatIdRef.current,
            mentionPageIds: contextPages?.map((p) => p.id),
          }}
          onTranscript={(text) => {
            if (!editor) return;
            const hasContent = !editor.isEmpty;
            editor.commands.insertContent(hasContent ? ` ${text}` : text);
            editor.commands.focus("end");
          }}
        />
```

- [ ] **Step 14.2: Commit**

```bash
git add apps/client/src/ee/ai-chat/components/chat-input.tsx
git commit -m "feat(ai-chat): add MicButton to chat input"
```

---

## Task 15: Integrate into Editor Ask-AI menu

**Files:**
- Modify: `apps/client/src/ee/ai/components/editor/ai-menu/ai-menu.tsx`

- [ ] **Step 15.1: Wire MicButton into the TextInput leftSection**

Edit `apps/client/src/ee/ai/components/editor/ai-menu/ai-menu.tsx`. Add the import near the top:

```tsx
import { MicButton } from "@/ee/voice-input/mic-button";
```

Read the current page id from the URL (the editor uses `useLocation`; the page slug is in the path). The `EditorAiMenu` does not yet know its `pageId`; we'll derive it from `editor.storage.collaboration?.document` is not reliable — instead, accept it via a prop OR pull from the editor state. Simplest: read from URL with a small util. Since this component is mounted inside the editor page, the path is `/s/:spaceSlug/p/:pageSlug`. Extract the slug.

After the `useLocation` hook usage, add:

```tsx
  const pageSlugFromPath = (() => {
    const m = location.pathname.match(/\/p\/([^/]+)/);
    return m ? m[1] : undefined;
  })();
```

Then add `leftSection` to the `TextInput` (already imported):

```tsx
          <TextInput
            ref={inputRef}
            className={classes.aiInput}
            placeholder="Ask AI..."
            data-autofocus
            value={prompt}
            disabled={isLoading}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            leftSection={
              <MicButton
                context={{ kind: "ask-ai", pageId: pageSlugFromPath }}
                onTranscript={(text) => {
                  setPrompt((p) => (p ? `${p} ${text}` : text));
                  inputRef.current?.focus();
                }}
              />
            }
            leftSectionWidth={48}
            rightSection={
              <ActionIcon
                disabled={!prompt || isLoading}
                variant="filled"
                color="blue"
                radius="xl"
                size="sm"
                onClick={() => handleGenerate()}
              >
                <IconArrowUp size={14} stroke={2.5} />
              </ActionIcon>
            }
            onKeyDown={handleKeyDown}
          />
```

> **Note on `pageId`:** the server's `SttService` calls `pageRepo.findById` which already accepts either a UUID or a slugId (`isValidUUID(pageId) ? where id : where slugId`). So passing the slug works directly. The DTO validator at `SttContextDto.pageId` uses `@IsUUID()` which will reject slugs — change it to `@IsString()` for `pageId` to accept either, and let the service's existing safety checks (workspace match) handle authorization.

- [ ] **Step 15.2: Relax the DTO validation for pageId**

Edit `apps/server/src/ee/ai/stt/dto/stt-context.dto.ts` — replace the `pageId` block with:

```ts
  @IsOptional()
  @IsString()
  pageId?: string;
```

(Remove `IsUUID` from the imports list if no longer used elsewhere in this file.)

- [ ] **Step 15.3: Commit**

```bash
git add apps/client/src/ee/ai/components/editor/ai-menu/ai-menu.tsx apps/server/src/ee/ai/stt/dto/stt-context.dto.ts
git commit -m "feat(ai): add MicButton to editor Ask-AI menu"
```

---

## Task 16: Integrate into Search Spotlight

**Files:**
- Modify: `apps/client/src/features/search/components/search-spotlight.tsx`

- [ ] **Step 16.1: Wire MicButton into the spotlight header**

Edit `apps/client/src/features/search/components/search-spotlight.tsx`. Add the import:

```tsx
import { MicButton } from "@/ee/voice-input/mic-button";
```

Inside the `<Group gap="xs" px="sm" pt="sm" pb="xs">` row, between `<Spotlight.Search ... />` and the conditional `<Button>`, add:

```tsx
          <MicButton
            context={{ kind: "search" }}
            onTranscript={(text) => {
              setQuery(text);
            }}
          />
```

- [ ] **Step 16.2: Commit**

```bash
git add apps/client/src/features/search/components/search-spotlight.tsx
git commit -m "feat(search): add MicButton to search spotlight"
```

---

## Task 17: Slash command `/voice` for page editor dictation

**Files:**
- Create: `apps/client/src/ee/voice-input/components/voice-dictate-modal.tsx`
- Modify: `apps/client/src/features/editor/components/slash-menu/menu-items.ts`

- [ ] **Step 17.1: Create a small modal that hosts the MicButton**

Create `apps/client/src/ee/voice-input/components/voice-dictate-modal.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Modal, Stack, Text, Group } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { MicButton } from "../mic-button";
import type { SttContext } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  context: SttContext;
  onTranscript: (text: string) => void;
}

export function VoiceDictateModal({ opened, onClose, context, onTranscript }: Props) {
  const { t } = useTranslation();
  const [hint, setHint] = useState(t("Click the mic to start recording."));

  useEffect(() => {
    if (opened) setHint(t("Click the mic to start recording."));
  }, [opened, t]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Voice dictation")}
      centered
      size="sm"
    >
      <Stack align="center" gap="md" py="md">
        <Text size="sm" c="dimmed">{hint}</Text>
        <Group justify="center">
          <MicButton
            context={context}
            onTranscript={(text) => {
              onTranscript(text);
              onClose();
            }}
          />
        </Group>
      </Stack>
    </Modal>
  );
}
```

- [ ] **Step 17.2: Add the `/voice` slash menu item**

Edit `apps/client/src/features/editor/components/slash-menu/menu-items.ts`. Add the import:

```ts
import { IconMicrophone } from "@tabler/icons-react";
```

Find an `advanced:` or similar group and add an entry — or append a new group at the bottom of `CommandGroups`. Insert this item in the most appropriate existing group (look for AI-related entries if present, otherwise the `basic` group):

```ts
    {
      title: "Voice dictation",
      description: "Record and transcribe speech into text.",
      searchTerms: ["voice", "dictate", "mic", "speech", "stt"],
      icon: IconMicrophone,
      command: ({ editor, range }: CommandProps) => {
        editor.chain().focus().deleteRange(range).run();
        const event = new CustomEvent("voice-dictate:open", {
          detail: { pageSlug: window.location.pathname.match(/\/p\/([^/]+)/)?.[1] },
        });
        window.dispatchEvent(event);
      },
    },
```

- [ ] **Step 17.3: Mount the modal at the editor shell level**

We need a host listening for the `voice-dictate:open` event. Edit `apps/client/src/features/editor/components/editor.tsx` (or the closest top-level editor wrapper — check via `ls apps/client/src/features/editor/components/`). Add near the bottom of the rendered tree:

```tsx
import { useEffect, useState } from "react";
import { VoiceDictateModal } from "@/ee/voice-input/components/voice-dictate-modal";
```

```tsx
  const [voiceOpen, setVoiceOpen] = useState<{ open: boolean; pageSlug?: string }>({
    open: false,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setVoiceOpen({ open: true, pageSlug: detail.pageSlug });
    };
    window.addEventListener("voice-dictate:open", handler);
    return () => window.removeEventListener("voice-dictate:open", handler);
  }, []);
```

And render at the end of the component:

```tsx
      <VoiceDictateModal
        opened={voiceOpen.open}
        onClose={() => setVoiceOpen({ open: false })}
        context={{ kind: "page", pageId: voiceOpen.pageSlug }}
        onTranscript={(text) => {
          editor?.commands.insertContent(text);
          editor?.commands.focus("end");
        }}
      />
```

> **Finding the right host file:** Run `grep -rn "useEditor" apps/client/src/features/editor/components/ | head -5` and pick the topmost editor component where `editor` is in scope. If no single host works, mount the modal in `apps/client/src/pages/page/page.tsx` (the route component) instead and pass the editor ref via context — fall back to that if needed.

- [ ] **Step 17.4: Commit**

```bash
git add apps/client/src/ee/voice-input/components/voice-dictate-modal.tsx apps/client/src/features/editor/components/slash-menu/menu-items.ts apps/client/src/features/editor/components/editor.tsx
git commit -m "feat(editor): /voice slash command opens dictation modal"
```

---

## Task 18: Manual smoke test

**Files:** none (verification only).

- [ ] **Step 18.1: Start the dev servers**

Run from repo root: `pnpm run dev`
Expected: client at `http://localhost:5173`, server at `:3000`.

- [ ] **Step 18.2: Verify `.env` has Mistral configured**

Check: `grep -E "MISTRAL_API_KEY|AI_DRIVER" .env`
Expected: `AI_DRIVER=mistral` and a non-empty `MISTRAL_API_KEY`. If not set, configure them before continuing — STT will return 503 otherwise.

- [ ] **Step 18.3: Smoke-test each surface**

For each of the four surfaces, perform a 5-second utterance and verify the transcript appears in the input:

1. **AI Chat:** open chat sidebar, click mic, say "create a new page called Voxtral migration plan", stop, verify text appears.
2. **Editor Ask-AI:** open a page, select some text, open the AI menu, click mic in the prompt input, dictate "improve this paragraph", verify text appears.
3. **Search Spotlight:** open spotlight (`Ctrl/Cmd+K`), click mic, dictate a search query, verify text appears in the search box.
4. **Page editor slash command:** in a page, type `/voice`, select Voice dictation, dictate a sentence, verify it inserts at the cursor.

- [ ] **Step 18.4: Smoke-test the admin toggle**

Go to Settings → AI, toggle "Voice input" off, refresh, verify the mic button disappears from all four surfaces.

- [ ] **Step 18.5: Smoke-test error paths**

1. Deny mic permission in the browser → expect toast "Microphone access denied."
2. Stop recording with no speech → expect toast "No speech detected."
3. Disconnect network mid-transcription → expect toast "Transcription failed."

- [ ] **Step 18.6: Commit any small fixes discovered during smoke**

If any small adjustments were needed, commit them with `fix(voice-input): <description>`. No commit if everything worked first time.

---

## Self-Review Checklist (for the executor)

After Task 18, run through:

- [ ] All 17 implementation tasks committed.
- [ ] `pnpm exec jest apps/server/src/ee/ai/stt/stt.service.spec.ts` → all green.
- [ ] `pnpm exec nest build` (in `apps/server`) → succeeds.
- [ ] `pnpm exec tsc --noEmit -p apps/client/tsconfig.json` → no new errors in voice-input files.
- [ ] Spec-coverage spot check:
  - Voxtral Small as default model ✓ (Task 2)
  - Two-pass correction with context ✓ (Task 4 `correct()`)
  - Auto-detect language (no language hint to Mistral) ✓ (Task 4 — no `language` field in form)
  - 60s cap ✓ (Task 10 `MAX_DURATION_MS`)
  - 5 MB cap ✓ (Task 5 `MAX_AUDIO_BYTES`)
  - In-memory only (no disk persistence) ✓ (Task 4 uses Buffer, never writes)
  - Audit log w/o transcript content ✓ (Task 5 `this.logger.log` excludes text)
  - Admin toggle ✓ (Task 7 + 13)
  - Env kill-switch ✓ (Task 2 + Task 5 check)
  - Four surfaces wired ✓ (Tasks 14–17)
- [ ] No transcript text is ever passed to `this.logger`.

If anything is missing, fix it and commit before opening the PR.
