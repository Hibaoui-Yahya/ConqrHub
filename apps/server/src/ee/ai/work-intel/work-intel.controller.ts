import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { ProjectSpaceMappingRepo } from '@docmost/db/repos/integration/project-space-mapping.repo';
import { WorkIntelService, SimilarWorkItem } from './work-intel.service';
import { WorkIntelBackfillDto, WorkIntelQueryDto } from './dto/work-intel.dto';

@UseGuards(JwtAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('retrieval')
@Controller('ai/work-items')
export class WorkIntelController {
  constructor(
    private readonly workIntel: WorkIntelService,
    private readonly mappings: ProjectSpaceMappingRepo,
    @InjectQueue(QueueName.AI_QUEUE) private readonly aiQueue: Queue,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('similar')
  async similar(
    @Body() dto: WorkIntelQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ items: SimilarWorkItem[] }> {
    const items = await this.workIntel.findSimilar({
      workspaceId: workspace.id,
      userId: user.id,
      title: dto.title,
      description: dto.description,
      limit: dto.limit,
    });
    return { items };
  }

  @HttpCode(HttpStatus.OK)
  @Post('predict-labels')
  async predictLabels(
    @Body() dto: WorkIntelQueryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ labels: { label: string; confidence: number }[] }> {
    return this.workIntel.predictLabels({
      workspaceId: workspace.id,
      userId: user.id,
      title: dto.title,
      description: dto.description,
      limit: dto.limit,
    });
  }

  /** Enqueue a semantic backfill for one mapped project, or all of them. */
  @HttpCode(HttpStatus.OK)
  @Post('backfill')
  async backfill(
    @Body() dto: WorkIntelBackfillDto,
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ enqueued: number }> {
    let projectIds: string[];
    if (dto.projectId) {
      const mapped = await this.mappings.listForProject(
        workspace.id,
        dto.projectId,
      );
      if (mapped.length === 0) {
        throw new NotFoundException('No mapping for this project in your workspace');
      }
      projectIds = [dto.projectId];
    } else {
      const mapped = await this.mappings.listForWorkspace(workspace.id);
      projectIds = Array.from(new Set(mapped.map((m) => m.planeProjectId)));
    }
    for (const projectId of projectIds) {
      await this.aiQueue.add(QueueJob.BACKFILL_PLANE_WORK_ITEMS, { projectId });
    }
    return { enqueued: projectIds.length };
  }
}
