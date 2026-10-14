import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { meetingAccessFor } from './meeting-access.util';

// Collaborators are doubles below; keep their ESM editor/SDK dependencies out.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));

/**
 * Deleting a meeting from ConqrMeet and sharing it with a Hub space:
 * legal hold blocks deletion; published Hub pages are kept by default and
 * moved to the Hub trash only when asked and allowed — checked before
 * anything is deleted; sharing needs a space of the workspace the caller
 * belongs to.
 */
describe('MeetingService delete and share', () => {
  const user = { id: 'annie', role: 'member' } as any;

  function setup(opts: {
    meeting?: Record<string, unknown>;
    docPages?: string[];
    pages?: Record<string, any>;
    canEdit?: boolean;
    canRead?: boolean;
    spaceInWorkspace?: boolean;
  }) {
    const updates: any[] = [];
    const db: any = {
      selectFrom: (table: string) => {
        const q: any = {
          select: () => q,
          where: () => q,
          execute: async () => (table === 'meetingDocuments' ? (opts.docPages ?? []).map((pageId) => ({ pageId })) : []),
          executeTakeFirst: async () => (table === 'spaces' ? (opts.spaceInWorkspace === false ? undefined : { id: 'sp' }) : undefined),
        };
        return q;
      },
      updateTable: () => {
        const q: any = {
          set: (v: any) => {
            updates.push(v);
            return q;
          },
          where: () => q,
          executeTakeFirst: async () => ({}),
        };
        return q;
      },
    };
    const pages = {
      findById: jest.fn(async (id: string) => opts.pages?.[id] ?? null),
      removePage: jest.fn(async () => undefined),
    };
    const spaceAbility = {
      createForUser: jest.fn(async () => ({
        cannot: (action: string) => (action === 'edit' ? opts.canEdit === false : opts.canRead === false),
      })),
    };
    const service = new MeetingService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, pages as any, spaceAbility as any, {} as any, {} as any);
    jest.spyOn(service as any, 'getMeetingOrThrow').mockResolvedValue({
      id: 'm1',
      workspaceId: 'w1',
      userId: 'annie',
      legalHold: false,
      settings: null,
      ...opts.meeting,
    });
    return { service, pages, updates };
  }

  it('keeps the Hub pages by default and reports it', async () => {
    const { service, pages, updates } = setup({ meeting: { settings: { publishedBundle: { meetingPageId: 'p1' } } } });
    await expect(service.delete('m1', { user })).resolves.toEqual({ hubPages: 'kept', trashedPageIds: [] });
    expect(pages.removePage).not.toHaveBeenCalled();
    expect(updates[0].deletedAt).toBeInstanceOf(Date);
  });

  it('moves the published pages to the Hub trash when asked and allowed', async () => {
    const { service, pages } = setup({
      meeting: { settings: { publishedBundle: { meetingPageId: 'p1' } } },
      docPages: ['p2', 'p1'],
      pages: { p1: { id: 'p1', spaceId: 's', workspaceId: 'w1' }, p2: { id: 'p2', spaceId: 's', workspaceId: 'w1' } },
    });
    await expect(service.delete('m1', { hubPages: 'trash', user })).resolves.toEqual({ hubPages: 'trashed', trashedPageIds: ['p1', 'p2'] });
    expect(pages.removePage).toHaveBeenCalledTimes(2);
  });

  it('refuses before deleting anything when the pages cannot be edited', async () => {
    const { service, pages, updates } = setup({
      meeting: { settings: { publishedBundle: { meetingPageId: 'p1' } } },
      pages: { p1: { id: 'p1', spaceId: 's', workspaceId: 'w1' } },
      canEdit: false,
    });
    await expect(service.delete('m1', { hubPages: 'trash', user })).rejects.toBeInstanceOf(ForbiddenException);
    expect(pages.removePage).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it('refuses a meeting under legal hold', async () => {
    const { service, updates } = setup({ meeting: { legalHold: true } });
    await expect(service.delete('m1', { user })).rejects.toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  it('reports none when nothing was published', async () => {
    const { service } = setup({});
    await expect(service.delete('m1', { user })).resolves.toEqual({ hubPages: 'none', trashedPageIds: [] });
  });

  it('shares with a space of the workspace the caller belongs to, or makes it private', async () => {
    jest.spyOn(MeetingService.prototype as any, 'toCamelMeeting').mockImplementation((x: any) => x);
    const ok = setup({});
    await ok.service.update('m1', { spaceId: '11111111-1111-4111-8111-111111111111', user });
    expect(ok.updates[0]).toEqual({ spaceId: '11111111-1111-4111-8111-111111111111' });
    const priv = setup({});
    await priv.service.update('m1', { spaceId: null, user });
    expect(priv.updates[0]).toEqual({ spaceId: null });
    await expect(setup({ spaceInWorkspace: false }).service.update('m1', { spaceId: 'x', user })).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({ canRead: false }).service.update('m1', { spaceId: 'x', user })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('meetingAccessFor', () => {
  it('says who may edit and which spaces see the meeting', () => {
    const m = { userId: 'annie', workspaceId: 'w1', spaceId: 'a', settings: { publishedBundle: { spaceId: 'b' } } };
    expect(meetingAccessFor(m, { id: 'annie', role: 'member', workspaceId: 'w1' })).toEqual({ canEdit: true, isAuthor: true, sharedSpaceIds: ['a', 'b'] });
    expect(meetingAccessFor(m, { id: 'marc', role: 'member', workspaceId: 'w1' }).canEdit).toBe(false);
    expect(meetingAccessFor(m, { id: 'sophie', role: 'admin', workspaceId: 'w1' }).canEdit).toBe(true);
  });
});
