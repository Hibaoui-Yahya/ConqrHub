jest.mock('../../../../core/page/services/page.service', () => ({
  PageService: class MockPageService {},
}));
jest.mock('@docmost/db/repos/attachment/attachment.repo', () => ({
  AttachmentRepo: class MockAttachmentRepo {},
}));
jest.mock('../../../../integrations/storage/storage.service', () => ({
  StorageService: class MockStorageService {},
}));
jest.mock('./svg-raster.util', () => ({
  rasterizeSvgToPng: jest.fn(),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReadAttachmentTool } from './read-attachment.tool';
import { rasterizeSvgToPng } from './svg-raster.util';

const mockRasterize = rasterizeSvgToPng as jest.Mock;

const mockAbility = { cannot: jest.fn() };
const attachmentRepo = { findByIdWithContent: jest.fn() };
const storage = { read: jest.fn() };
const pageService = { findById: jest.fn() };
const spaceAbility = { createForUser: jest.fn().mockResolvedValue(mockAbility) };
const registry = { register: jest.fn() };
const ctx = { user: { id: 'u1' } as any, workspaceId: 'ws-1' };

function newTool() {
  return new ReadAttachmentTool(
    attachmentRepo as any,
    storage as any,
    pageService as any,
    spaceAbility as any,
    registry as any,
  );
}

describe('ReadAttachmentTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAbility.cannot.mockReturnValue(false);
  });

  it('returns an image as a viewable image content block', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a1', fileName: 'diagram.png', mimeType: 'image/png',
      fileSize: '1024', filePath: '/x/a1.png', spaceId: 'sp-1', pageId: null, textContent: null,
    });
    storage.read.mockResolvedValue(Buffer.from('PNGBYTES'));
    const res = await newTool().execute({ attachmentId: 'a1' }, ctx);
    expect(res.__mcpContent[0]).toEqual({
      type: 'image',
      data: Buffer.from('PNGBYTES').toString('base64'),
      mimeType: 'image/png',
    });
    expect(res.meta?.fileName).toBe('diagram.png');
  });

  it('rasterises an Excalidraw SVG to a PNG image block', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a-svg', fileName: 'diagram.excalidraw.svg', mimeType: 'image/svg+xml',
      fileSize: '2048', filePath: '/x/a-svg.svg', spaceId: 'sp-1', pageId: null,
      textContent: null, fileExt: 'svg',
    });
    storage.read.mockResolvedValue(Buffer.from('<svg>…</svg>'));
    mockRasterize.mockResolvedValue(Buffer.from('PNGDATA'));
    const res = await newTool().execute({ attachmentId: 'a-svg' }, ctx);
    expect(res.__mcpContent[0]).toEqual({
      type: 'image',
      data: Buffer.from('PNGDATA').toString('base64'),
      mimeType: 'image/png',
    });
    expect(mockRasterize).toHaveBeenCalledTimes(1);
  });

  it('falls back to SVG markup text when rasterisation fails', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a-svg2', fileName: 'draw.svg', mimeType: 'image/svg+xml',
      fileSize: '2048', filePath: '/x/a-svg2.svg', spaceId: 'sp-1', pageId: null,
      textContent: null, fileExt: 'svg',
    });
    storage.read.mockResolvedValue(Buffer.from('<svg><rect/></svg>'));
    mockRasterize.mockResolvedValue(null);
    const res = await newTool().execute({ attachmentId: 'a-svg2' }, ctx);
    expect(res.__mcpContent[0].type).toBe('text');
    expect((res.__mcpContent[0] as any).text).toContain('<svg>');
  });

  it('returns extracted textContent for an indexed document', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a2', fileName: 'policy.pdf', mimeType: 'application/pdf',
      fileSize: '99999', filePath: '/x/a2.pdf', spaceId: 'sp-1', pageId: null,
      textContent: 'Leave policy: 25 days per year.',
    });
    const res = await newTool().execute({ attachmentId: 'a2' }, ctx);
    expect(res.__mcpContent[0].type).toBe('text');
    expect((res.__mcpContent[0] as any).text).toContain('25 days per year');
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('decodes a plain-text file inline', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a3', fileName: 'notes.md', mimeType: 'text/markdown',
      fileSize: '10', filePath: '/x/a3.md', spaceId: 'sp-1', pageId: null, textContent: null, fileExt: 'md',
    });
    storage.read.mockResolvedValue(Buffer.from('# Hello'));
    const res = await newTool().execute({ attachmentId: 'a3' }, ctx);
    expect((res.__mcpContent[0] as any).text).toContain('# Hello');
  });

  it('does not inline an oversized image', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a4', fileName: 'huge.png', mimeType: 'image/png',
      fileSize: String(20 * 1024 * 1024), filePath: '/x/a4.png', spaceId: 'sp-1', pageId: null, textContent: null,
    });
    const res = await newTool().execute({ attachmentId: 'a4' }, ctx);
    expect(res.__mcpContent[0].type).toBe('text');
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('404s an unknown attachment', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue(undefined);
    await expect(newTool().execute({ attachmentId: 'nope' }, ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('denies when the caller lacks space read permission', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a5', fileName: 'secret.png', mimeType: 'image/png',
      fileSize: '10', filePath: '/x/a5.png', spaceId: 'sp-secret', pageId: null, textContent: null,
    });
    mockAbility.cannot.mockReturnValue(true);
    await expect(newTool().execute({ attachmentId: 'a5' }, ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(storage.read).not.toHaveBeenCalled();
  });

  it('denies an attachment not tied to any space (no leak)', async () => {
    attachmentRepo.findByIdWithContent.mockResolvedValue({
      id: 'a6', fileName: 'chat-upload.png', mimeType: 'image/png',
      fileSize: '10', filePath: '/x/a6.png', spaceId: null, pageId: null, textContent: null,
    });
    await expect(newTool().execute({ attachmentId: 'a6' }, ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
