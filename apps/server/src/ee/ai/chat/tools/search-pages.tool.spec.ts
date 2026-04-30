import { SearchPagesTool } from './search-pages.tool';
import { SearchService } from '../../../../core/search/search.service';
import { ChatToolRegistry } from './chat-tool.registry';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER: any = { id: 'user-42', workspaceId: 'ws-1' };
const CTX = { user: USER, workspaceId: 'ws-1' };

function makeSearchService(
  items: any[] = [],
): jest.Mocked<Pick<SearchService, 'searchPage'>> {
  return {
    searchPage: jest.fn().mockResolvedValue({ items }),
  } as any;
}

function makeRegistry(): jest.Mocked<Pick<ChatToolRegistry, 'register'>> {
  return { register: jest.fn() } as any;
}

function makeTool(
  items: any[] = [],
): { tool: SearchPagesTool; search: ReturnType<typeof makeSearchService> } {
  const search = makeSearchService(items);
  const tool = new SearchPagesTool(search as any, makeRegistry() as any);
  return { tool, search };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchPagesTool', () => {
  it('passes the request user ID and workspaceId to searchPage', async () => {
    const { tool, search } = makeTool();

    await tool.execute({ query: 'authentication', limit: 5 }, CTX);

    expect(search.searchPage).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'authentication', limit: 5 }),
      expect.objectContaining({ userId: 'user-42', workspaceId: 'ws-1' }),
    );
  });

  it('applies the default limit of 5 when not specified', async () => {
    const { tool, search } = makeTool();

    await tool.execute({ query: 'auth' }, CTX);

    expect(search.searchPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
      expect.anything(),
    );
  });

  it('maps search results to the expected shape', async () => {
    const { tool } = makeTool([
      { id: 'p1', title: 'Auth Guide', slugId: 'auth-guide', highlight: 'Learn about auth.' },
    ]);

    const result = await tool.execute({ query: 'auth', limit: 3 }, CTX);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'p1',
      title: 'Auth Guide',
      excerpt: 'Learn about auth.',
    });
  });

  it('returns an empty array when searchPage returns no results', async () => {
    const { tool } = makeTool([]);

    const result = await tool.execute({ query: 'unknown topic' }, CTX);

    expect(result).toEqual([]);
  });

  it('registers itself with the ChatToolRegistry on module init', () => {
    const registry = makeRegistry();
    const tool = new SearchPagesTool(makeSearchService() as any, registry as any);

    tool.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(tool);
  });
});
