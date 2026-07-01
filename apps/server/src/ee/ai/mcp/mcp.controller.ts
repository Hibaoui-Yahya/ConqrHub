import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpService } from './mcp.service';
import { WorkspaceAiToggleGuard } from '../guards/workspace-ai-toggle.guard';
import { RequireAiFeature } from '../guards/require-ai-feature.decorator';
import { McpAuthGuard } from './oauth/mcp-auth.guard';

@UseGuards(McpAuthGuard, WorkspaceAiToggleGuard)
@RequireAiFeature('mcp')
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post()
  async handle(
    @Body() body: { jsonrpc: string; id: number | string; method: string; params?: any },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    try {
      const result = await this.mcpService.handleRequest(body, {
        user,
        workspace,
      });

      return {
        jsonrpc: '2.0',
        id: body.id,
        result,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return {
        jsonrpc: '2.0',
        id: body.id ?? 0,
        error: { code: -32603, message },
      };
    }
  }
}
