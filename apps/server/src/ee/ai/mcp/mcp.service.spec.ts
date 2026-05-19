import { z } from 'zod';
import { McpService } from './mcp.service';
import { ChatToolRegistry } from '../chat/tools/chat-tool.registry';
import { ChatTool } from '../chat/tools/chat-tool.types';

function makeRegistry(tools: ChatTool[]): ChatToolRegistry {
  return { getAll: () => tools } as any;
}

function makeService(tools: ChatTool[]): McpService {
  return new McpService(makeRegistry(tools));
}

describe('McpService.tools/list', () => {
  it('converts Zod parameter schemas to JSON Schema (draft 2020-12, input mode)', async () => {
    const tool: ChatTool = {
      name: 'search_pages',
      description: 'Search pages',
      parameters: z.object({
        query: z.string().describe('The search query'),
        limit: z.number().int().min(1).max(20).optional().default(5),
      }),
      execute: async () => [],
    };
    const svc = makeService([tool]);

    const res = await svc.handleRequest(
      { method: 'tools/list' },
      { user: {} as any, workspace: {} as any },
    );

    expect(res.tools).toHaveLength(1);
    const schema = res.tools[0].inputSchema as any;
    expect(schema.type).toBe('object');
    expect(schema.properties.query).toEqual(
      expect.objectContaining({ type: 'string', description: 'The search query' }),
    );
    expect(schema.properties.limit).toEqual(
      expect.objectContaining({ type: 'integer', minimum: 1, maximum: 20, default: 5 }),
    );
    // `.optional().default(5)` is optional on the input side
    expect(schema.required).toEqual(['query']);
    // No internal Zod fields leaked
    expect(schema.def).toBeUndefined();
    expect(schema.shape).toBeUndefined();
  });

  it('memoizes the converted schema across calls', async () => {
    const tool: ChatTool = {
      name: 'noop',
      description: 'noop',
      parameters: z.object({ a: z.string() }),
      execute: async () => null,
    };
    const svc = makeService([tool]);
    const ctx = { user: {} as any, workspace: {} as any };

    const a = await svc.handleRequest({ method: 'tools/list' }, ctx);
    const b = await svc.handleRequest({ method: 'tools/list' }, ctx);
    expect(a.tools[0].inputSchema).toBe(b.tools[0].inputSchema);
  });

  it('passes through a schema that is already plain JSON Schema', async () => {
    const plain = { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] };
    const tool: ChatTool = {
      name: 'plain',
      description: 'plain',
      parameters: plain,
      execute: async () => null,
    };
    const svc = makeService([tool]);

    const res = await svc.handleRequest(
      { method: 'tools/list' },
      { user: {} as any, workspace: {} as any },
    );
    expect(res.tools[0].inputSchema).toEqual(plain);
  });

  it('falls back to an empty object schema for unknown parameter shapes', async () => {
    const tool: ChatTool = {
      name: 'weird',
      description: 'weird',
      parameters: 'not a schema',
      execute: async () => null,
    };
    const svc = makeService([tool]);

    const res = await svc.handleRequest(
      { method: 'tools/list' },
      { user: {} as any, workspace: {} as any },
    );
    expect(res.tools[0].inputSchema).toEqual({ type: 'object', properties: {} });
  });
});

describe('McpService.initialize', () => {
  const ctx = { user: {} as any, workspace: {} as any };

  it('echoes the client protocol version when supported', async () => {
    const svc = makeService([]);
    const res = await svc.handleRequest(
      { method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      ctx,
    );
    expect(res.protocolVersion).toBe('2025-03-26');
    expect(res.capabilities).toEqual({ tools: {} });
    expect(res.serverInfo.name).toBe('ConqrHub MCP');
  });

  it('falls back to the latest supported version on unknown client version', async () => {
    const svc = makeService([]);
    const res = await svc.handleRequest(
      { method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      ctx,
    );
    expect(res.protocolVersion).toBe('2025-06-18');
  });

  it('uses the latest version when client omits protocolVersion', async () => {
    const svc = makeService([]);
    const res = await svc.handleRequest(
      { method: 'initialize', params: {} },
      ctx,
    );
    expect(res.protocolVersion).toBe('2025-06-18');
  });
});

describe('McpService.getToolsCatalog', () => {
  it('categorizes tools by name pattern', () => {
    const tools: ChatTool[] = [
      { name: 'search_pages', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'get_page', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'create_page', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'delete_page', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'create_space', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'get_space', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'create_comment', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'get_page_comments', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'search_attachments', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'get_current_user', description: 'd', parameters: z.object({}), execute: async () => null },
      { name: 'list_workspace_members', description: 'd', parameters: z.object({}), execute: async () => null },
    ];
    const catalog = makeService(tools).getToolsCatalog();
    const byName = Object.fromEntries(catalog.map((t) => [t.name, t.category]));
    expect(byName).toEqual({
      search_pages: 'Search & RAG',
      get_page: 'Pages (read)',
      create_page: 'Pages (write)',
      delete_page: 'Pages (write)',
      create_space: 'Spaces (write)',
      get_space: 'Spaces (read)',
      create_comment: 'Comments (write)',
      get_page_comments: 'Comments (read)',
      search_attachments: 'Attachments',
      get_current_user: 'Users',
      list_workspace_members: 'Users',
    });
  });
});
