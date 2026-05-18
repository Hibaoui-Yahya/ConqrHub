import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { v7 as uuid7 } from 'uuid';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpService } from './mcp.service';

interface McpSession {
  reply: FastifyReply;
  workspaceId: string;
  userId: string;
}

const MCP_SESSIONS = new Map<string, McpSession>();

@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  @Get('sse')
  async sse(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: false }) reply: FastifyReply,
  ) {
    const sessionId = uuid7();

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    MCP_SESSIONS.set(sessionId, {
      reply,
      workspaceId: workspace.id,
      userId: user.id,
    });

    const messageUrl = `/mcp/messages?sessionId=${sessionId}`;
    reply.raw.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

    reply.raw.on('close', () => {
      MCP_SESSIONS.delete(sessionId);
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('messages')
  async messages(
    @Query('sessionId') sessionId: string,
    @Req() req: FastifyRequest,
  ) {
    const session = MCP_SESSIONS.get(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const body = req.body as {
      jsonrpc: '2.0';
      id: number | string;
      method: string;
      params?: any;
    };

    try {
      const result = await this.mcpService.handleRequest(body, {
        workspaceId: session.workspaceId,
        userId: session.userId,
      });

      if (result !== undefined) {
        const rpcResponse = { jsonrpc: '2.0', id: body.id, result };
        session.reply.raw.write(`data: ${JSON.stringify(rpcResponse)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const errorResponse = {
        jsonrpc: '2.0',
        id: body.id ?? 0,
        error: { code: -32603, message },
      };
      session.reply.raw.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
    }
  }
}
