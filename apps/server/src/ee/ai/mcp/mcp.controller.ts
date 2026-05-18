import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpService } from './mcp.service';

@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async handle(
    @Body() body: { jsonrpc: string; id: number | string; method: string; params?: any },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    try {
      const result = await this.mcpService.handleRequest(body, {
        workspaceId: workspace.id,
        userId: user.id,
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
