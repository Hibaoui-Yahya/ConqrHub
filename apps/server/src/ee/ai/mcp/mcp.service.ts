import { Injectable, Logger } from '@nestjs/common';
import { ChatToolRegistry } from '../chat/tools/chat-tool.registry';
import { User, Workspace } from '@docmost/db/types/entity.types';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface McpContext {
  user: User;
  workspace: Workspace;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  private readonly serverInfo = {
    name: 'ConqrHub MCP',
    version: '0.80.1',
  };

  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private readonly toolRegistry: ChatToolRegistry) {}

  createTransport(ctx: McpContext): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onmessage = async (message: JSONRPCMessage) => {
      try {
        if ('method' in message) {
          const result = await this.handleRequest(
            { method: message.method, params: (message as any).params },
            ctx,
          );
          await transport.send({
            jsonrpc: '2.0',
            id: (message as any).id,
            result,
          } as JSONRPCMessage);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Internal error';
        await transport.send({
          jsonrpc: '2.0',
          id: (message as any).id ?? 0,
          error: { code: -32603, message: errorMessage },
        } as JSONRPCMessage);
      }
    };

    transport.onclose = () => {
      if (transport.sessionId) {
        this.transports.delete(transport.sessionId);
      }
    };

    if (transport.sessionId) {
      this.transports.set(transport.sessionId, transport);
    }

    return transport;
  }

  async handleStreamRequest(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: McpContext,
    parsedBody?: unknown,
  ): Promise<void> {
    const sessionId = this.extractSessionId(req);

    let transport = sessionId ? this.transports.get(sessionId) : undefined;

    if (!transport) {
      transport = this.createTransport(ctx);
    }

    await transport.handleRequest(req, res, parsedBody);
  }

  private extractSessionId(req: IncomingMessage): string | undefined {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    return url.searchParams.get('sessionId') || undefined;
  }

  async handleRequest(
    request: { method: string; params?: any },
    ctx: McpContext,
  ): Promise<any> {
    switch (request.method) {
      case 'initialize':
        return this.initialize(request.params);

      case 'notifications/initialized':
        return {};

      case 'tools/list':
        return this.listTools();

      case 'tools/call':
        return this.callTool(request.params, ctx);

      case 'resources/list':
        return { resources: [] };

      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }

  private initialize(params: any) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: this.serverInfo,
    };
  }

  private listTools() {
    const tools = this.toolRegistry.getAll();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      })),
    };
  }

  private async callTool(
    params: { name: string; arguments?: any },
    ctx: McpContext,
  ) {
    const tool = this.toolRegistry.getAll().find((t) => t.name === params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${params.name}`);
    }

    const toolCtx = { user: ctx.user, workspaceId: ctx.workspace.id };

    try {
      const result = await tool.execute(params.arguments ?? {}, toolCtx as any);

      const text = result === undefined || result === null
        ? 'null'
        : typeof result === 'string'
          ? result
          : JSON.stringify(result, (key, value) => {
              if (value === undefined) return null;
              return value;
            }, 2);

      return {
        content: [{ type: 'text' as const, text }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool execution failed';
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
}
