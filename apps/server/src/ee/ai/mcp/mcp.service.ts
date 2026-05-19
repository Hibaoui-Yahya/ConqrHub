import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ChatToolRegistry } from '../chat/tools/chat-tool.registry';
import { User, Workspace } from '@docmost/db/types/entity.types';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export interface McpContext {
  user: User;
  workspace: Workspace;
}

function categorizeTool(name: string): string {
  if (name.includes('attachment')) return 'Attachments';
  if (name === 'rag_retrieve' || name === 'search_pages') return 'Search & RAG';
  if (name.endsWith('_comment') || name.endsWith('_comments')) {
    return /^(create|update|delete)_comment$/.test(name)
      ? 'Comments (write)'
      : 'Comments (read)';
  }
  if (name === 'get_current_user' || name.includes('member')) return 'Users';
  if (name.includes('space')) {
    return /^(create|update|delete)_space/.test(name) ? 'Spaces (write)' : 'Spaces (read)';
  }
  if (
    /^(create|update|delete|move|duplicate|copy)_page/.test(name) ||
    name === 'copy_page_to_space' ||
    name === 'move_page_to_space'
  ) {
    return 'Pages (write)';
  }
  return 'Pages (read)';
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  private readonly serverInfo = {
    name: 'ConqrHub MCP',
    version: '0.80.1',
  };

  // Most recent first — we echo back the client's version if we support it,
  // otherwise fall back to our latest. Per MCP spec §Initialization.
  private readonly supportedProtocolVersions = [
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
  ];

  private readonly transport: StreamableHTTPServerTransport;
  private readonly jsonSchemaCache = new Map<string, unknown>();

  constructor(private readonly toolRegistry: ChatToolRegistry) {
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    this.transport.onmessage = async (
      message: JSONRPCMessage,
      extra?: MessageExtraInfo,
    ) => {
      try {
        const ctx = extra?.authInfo?.extra as unknown as McpContext | undefined;

        if ('method' in message) {
          const result = await this.handleRequest(
            { method: message.method, params: (message as any).params },
            ctx ?? { user: {} as User, workspace: {} as Workspace },
          );
          await this.transport.send({
            jsonrpc: '2.0',
            id: (message as any).id,
            result,
          } as JSONRPCMessage);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Internal error';
        await this.transport.send({
          jsonrpc: '2.0',
          id: (message as any).id ?? 0,
          error: { code: -32603, message: errorMessage },
        } as JSONRPCMessage);
      }
    };

    this.transport.onclose = () => {
      this.logger.log('MCP stream transport closed');
    };
  }

  async handleStreamRequest(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: McpContext,
    parsedBody?: unknown,
  ): Promise<void> {
    (req as any).auth = {
      token: '',
      clientId: ctx.user.id,
      scopes: [],
      extra: ctx as unknown as Record<string, unknown>,
    } as AuthInfo;

    await this.transport.handleRequest(req, res, parsedBody);
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
    const requested =
      typeof params?.protocolVersion === 'string'
        ? params.protocolVersion
        : undefined;
    const negotiated =
      requested && this.supportedProtocolVersions.includes(requested)
        ? requested
        : this.supportedProtocolVersions[0];

    return {
      protocolVersion: negotiated,
      capabilities: { tools: {} },
      serverInfo: this.serverInfo,
    };
  }

  private listTools() {
    const tools = this.toolRegistry.getAll();
    return {
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: this.toInputJsonSchema(t.name, t.parameters),
      })),
    };
  }

  getToolsCatalog(): {
    name: string;
    description: string;
    category: string;
    inputSchema: unknown;
  }[] {
    return this.toolRegistry.getAll().map((t) => ({
      name: t.name,
      description: t.description,
      category: categorizeTool(t.name),
      inputSchema: this.toInputJsonSchema(t.name, t.parameters),
    }));
  }

  private toInputJsonSchema(name: string, parameters: unknown): unknown {
    const cached = this.jsonSchemaCache.get(name);
    if (cached) return cached;

    let schema: unknown;
    if (parameters instanceof z.ZodType) {
      schema = z.toJSONSchema(parameters, { io: 'input' });
    } else if (
      parameters &&
      typeof parameters === 'object' &&
      (parameters as any).type === 'object'
    ) {
      schema = parameters;
    } else {
      schema = { type: 'object', properties: {} };
    }

    if (schema && typeof schema === 'object') {
      delete (schema as any).$schema;
    }
    this.jsonSchemaCache.set(name, schema);
    return schema;
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

    let args: unknown = params.arguments ?? {};
    if (tool.parameters instanceof z.ZodType) {
      const parsed = (tool.parameters as z.ZodType).safeParse(args);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid arguments for ${tool.name}: ${issues}`,
            },
          ],
          isError: true,
        };
      }
      args = parsed.data;
    }

    try {
      const result = await tool.execute(args, toolCtx as any);

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
