jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AddDiagramTool } from './add-diagram.tool';

const mockPage = { id: 'p1', spaceId: 'sp-1' };
const mockAbility = { cannot: jest.fn() };
const mockPageService = { findById: jest.fn(), updatePageContent: jest.fn() };
const mockSpaceAbility = {
  createForUser: jest.fn().mockResolvedValue(mockAbility),
};
const mockRegistry = { register: jest.fn() };
const ctx = { user: { id: 'user-1' } as any, workspaceId: 'ws-1' };

function newTool() {
  return new AddDiagramTool(
    mockPageService as any,
    mockSpaceAbility as any,
    mockRegistry as any,
  );
}

describe('AddDiagramTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
    mockPageService.findById.mockResolvedValue(mockPage);
    mockPageService.updatePageContent.mockResolvedValue(undefined);
  });

  it('appends a mermaid code block with the given source', async () => {
    const tool = newTool();
    const res = await tool.execute(
      {
        pageId: 'p1',
        type: 'mermaid',
        source: 'flowchart LR\n  A --> B',
      },
      ctx,
    );

    expect(res).toEqual({ success: true, pageId: 'p1', type: 'mermaid' });
    expect(mockPageService.updatePageContent).toHaveBeenCalledTimes(1);
    const [, content, op, format] = mockPageService.updatePageContent.mock.calls[0];
    expect(format).toBe('markdown');
    expect(op).toBe('append');
    expect(content).toContain('```mermaid');
    expect(content).toContain('flowchart LR\n  A --> B');
    expect(content).toMatch(/```mermaid\n[\s\S]+\n```/);
  });

  it('honors prepend and caption', async () => {
    const tool = newTool();
    await tool.execute(
      {
        pageId: 'p1',
        type: 'mermaid',
        source: 'sequenceDiagram\n  A->>B: Hi',
        caption: 'Fig 1: auth handshake',
        position: 'prepend',
      },
      ctx,
    );
    const [, content, op] = mockPageService.updatePageContent.mock.calls[0];
    expect(op).toBe('prepend');
    expect(content).toContain('Fig 1: auth handshake');
    expect(content.indexOf('```mermaid')).toBeLessThan(
      content.indexOf('Fig 1: auth handshake'),
    );
  });

  it('rejects source that already contains a fence', async () => {
    const tool = newTool();
    await expect(
      tool.execute(
        {
          pageId: 'p1',
          type: 'mermaid',
          source: '```mermaid\nflowchart LR\n  A --> B\n```',
        },
        ctx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('rejects unsupported diagram types', async () => {
    const tool = newTool();
    await expect(
      tool.execute(
        { pageId: 'p1', type: 'excalidraw' as any, source: '{}' },
        ctx,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockPageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when page is missing', async () => {
    mockPageService.findById.mockResolvedValueOnce(null);
    const tool = newTool();
    await expect(
      tool.execute(
        { pageId: 'missing', type: 'mermaid', source: 'flowchart LR\nA-->B' },
        ctx,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ForbiddenException without edit permission', async () => {
    mockAbility.cannot.mockReturnValueOnce(true);
    const tool = newTool();
    await expect(
      tool.execute(
        { pageId: 'p1', type: 'mermaid', source: 'flowchart LR\nA-->B' },
        ctx,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPageService.updatePageContent).not.toHaveBeenCalled();
  });
});
