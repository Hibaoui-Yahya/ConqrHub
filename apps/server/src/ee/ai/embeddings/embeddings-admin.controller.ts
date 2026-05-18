import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../../core/casl/interfaces/workspace-ability.type';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { ChunkingService } from './chunking.service';
import {
  BackfillEmbeddingsDto,
  BackfillEmbeddingsResult,
} from './dto/backfill-embeddings.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/embeddings')
export class EmbeddingsAdminController {
  private readonly logger = new Logger(EmbeddingsAdminController.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
    private readonly env: EnvironmentService,
    private readonly chunking: ChunkingService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('backfill')
  async backfill(
    @Body() dto: BackfillEmbeddingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<BackfillEmbeddingsResult> {
    const warnings: string[] = [];

    const isInsightMode = dto.sourceKind === 'expert_insight';

    if (isInsightMode) {
      return this.backfillInsights(dto, warnings);
    }

    let query = (this.db as any)
      .selectFrom('pages')
      .select(['id', 'textContent'])
      .where('workspaceId', '=', dto.workspaceId)
      .where('deletedAt', 'is', null);

    if (dto.pageId) {
      query = query.where('id', '=', dto.pageId);
    } else if (dto.spaceId) {
      query = query.where('spaceId', '=', dto.spaceId);
    }

    const pages: { id: string; textContent: string | null }[] =
      await query.execute();

    const chunkChars = this.env.getAiEmbeddingChunkChars();
    const overlap = this.env.getAiEmbeddingChunkOverlap();

    let estimatedChunks = 0;
    let skippedPages = 0;

    for (const page of pages) {
      if (!page.textContent?.trim()) {
        skippedPages++;
        continue;
      }
      const chunks = this.chunking.chunk(page.textContent, {
        chunkChars,
        overlap,
      });
      estimatedChunks += chunks.length;
    }

    const indexablePages = pages.length - skippedPages;

    if (pages.length === 0) {
      warnings.push('No pages found matching the given scope.');
    }
    if (skippedPages > 0) {
      warnings.push(
        `${skippedPages} page(s) skipped — no text content to embed.`,
      );
    }

    let enqueuedJobs = 0;

    if (!dto.dryRun && indexablePages > 0) {
      const pageIds = pages
        .filter((p) => p.textContent?.trim())
        .map((p) => p.id);

      // Enqueue in chunks of 50 so individual jobs stay small.
      const JOB_BATCH = 50;
      for (let i = 0; i < pageIds.length; i += JOB_BATCH) {
        const batch = pageIds.slice(i, i + JOB_BATCH);
        await this.aiQueue.add(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
          pageIds: batch,
          workspaceId: dto.workspaceId,
        });
        enqueuedJobs++;
      }

      this.logger.log(
        `Backfill: enqueued ${enqueuedJobs} job(s) for ${indexablePages} pages ` +
          `(workspace=${dto.workspaceId})`,
      );
    }

    return {
      estimatedPages: indexablePages,
      estimatedChunks,
      estimatedEmbeddingCalls: estimatedChunks,
      enqueuedJobs,
      skippedPages,
      warnings,
    };
  }

  private async backfillInsights(
    dto: BackfillEmbeddingsDto,
    warnings: string[],
  ): Promise<BackfillEmbeddingsResult> {
    let query = (this.db as any)
      .selectFrom('expertInsights')
      .select(['id', 'title', 'body'])
      .where('workspaceId', '=', dto.workspaceId)
      .where('deletedAt', 'is', null);

    if (dto.insightId) {
      query = query.where('id', '=', dto.insightId);
    }

    const insights: { id: string; title: string | null; body: string | null }[] =
      await query.execute();

    const chunkChars = this.env.getAiEmbeddingChunkChars();
    const overlap = this.env.getAiEmbeddingChunkOverlap();

    let estimatedChunks = 0;
    let skipped = 0;

    for (const insight of insights) {
      const text = [insight.title, insight.body].filter(Boolean).join('\n\n');
      if (!text.trim()) {
        skipped++;
        continue;
      }
      const chunks = this.chunking.chunk(text, { chunkChars, overlap });
      estimatedChunks += chunks.length;
    }

    const indexable = insights.length - skipped;

    if (insights.length === 0) {
      warnings.push('No insights found matching the given scope.');
    }
    if (skipped > 0) {
      warnings.push(`${skipped} insight(s) skipped — no text content to embed.`);
    }

    let enqueuedJobs = 0;

    if (!dto.dryRun && indexable > 0) {
      const insightIds = insights
        .filter((ins) => {
          const text = [ins.title, ins.body].filter(Boolean).join('\n\n');
          return text.trim();
        })
        .map((ins) => ins.id);

      const JOB_BATCH = 50;
      for (let i = 0; i < insightIds.length; i += JOB_BATCH) {
        const batch = insightIds.slice(i, i + JOB_BATCH);
        await this.aiQueue.add(QueueJob.GENERATE_INSIGHT_EMBEDDINGS, {
          insightIds: batch,
          workspaceId: dto.workspaceId,
        });
        enqueuedJobs++;
      }

      this.logger.log(
        `Insight backfill: enqueued ${enqueuedJobs} job(s) for ${indexable} insights ` +
          `(workspace=${dto.workspaceId})`,
      );
    }

    return {
      estimatedPages: indexable,
      estimatedChunks,
      estimatedEmbeddingCalls: estimatedChunks,
      enqueuedJobs,
      skippedPages: skipped,
      warnings,
    };
  }
}
