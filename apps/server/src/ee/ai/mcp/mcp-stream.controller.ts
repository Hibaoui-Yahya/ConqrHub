import {
  All,
  Controller,
  Logger,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpService } from './mcp.service';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { McpAuthGuard } from './oauth/mcp-auth.guard';

@UseGuards(McpAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('mcp')
@Controller('mcp/stream')
export class McpStreamController {
  private readonly logger = new Logger(McpStreamController.name);

  constructor(private readonly mcpService: McpService) {}

  @All()
  async handle(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const body = (req as any).body;
    await this.mcpService.handleStreamRequest(
      req.raw,
      reply.raw,
      { user, workspace },
      body,
    );
  }
}
