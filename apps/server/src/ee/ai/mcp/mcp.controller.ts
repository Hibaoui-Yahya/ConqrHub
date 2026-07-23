import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  MethodNotAllowedException,
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

  /**
   * MCP Streamable HTTP: a client opens a server->client SSE stream with
   * `GET /mcp`. This server is request/response only (no server-initiated
   * messages), so the spec requires HTTP 405 here — NOT a 404. Returning 404
   * (route-not-found) makes strict clients (e.g. Claude, ChatGPT) treat the
   * endpoint as invalid and abort the connection after a successful
   * `initialize`. The `Allow` header advertises the supported method.
   */
  @SkipTransform()
  @Get()
  @Header('Allow', 'POST')
  openStream(): never {
    throw new MethodNotAllowedException(
      'This MCP endpoint is request/response only and does not offer a server-initiated SSE stream. Use POST.',
    );
  }

  /**
   * MCP Streamable HTTP session termination (`DELETE /mcp`). We use no
   * server-managed session, so respond 405 (not 404) per the same rule.
   */
  @SkipTransform()
  @Delete()
  @Header('Allow', 'POST')
  terminateSession(): never {
    throw new MethodNotAllowedException(
      'Explicit session termination is not supported; sessions are stateless.',
    );
  }
}
