import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingService } from './meeting.service';

// Collaborators are doubles below; keep their ESM editor/SDK dependencies out.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));

/**
 * "Publier dans Hub" and its re-synchronisation: permission on the space,
 * pages refreshed only when untouched in Hub, deleted pages made again.
 */
describe('MeetingService.publishBundle', () => {
  const user = { id: 'u-pub' } as any;
  const T0 = '2026-10-13T10:00:00.000Z';

  function setup(opts: {
    settings?: Record<string, unknown> | null;
    canCreate?: boolean;
    spaceInWorkspace?: boolean;
    pages?: Record<string, { id: string; updatedAt: string; deletedAt?: string | null }>;
  }) {
    const updates: any[] = [];
    const db: any = {
      selectFrom: () => {
        const q: any = {
          select: () => q,
          where: () => q,
          executeTakeFirst: async () =>
            opts.spaceInWorkspace === false ? undefined : { id: 'space-1' },
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
    let created = 0;
    const pages = {
      findById: jest.fn(async (id: string) => opts.pages?.[id] ?? null),
      create: jest.fn(async () => ({ id: `new-${++created}` })),
      updatePageContent: jest.fn(async () => undefined),
    };
    const spaceAbility = {
      createForUser: jest.fn(async () => ({
        cannot: () => opts.canCreate === false,
      })),
    };
    const service = new MeetingService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      pages as any,
      spaceAbility as any,
    );
    jest.spyOn(service as any, 'getMeetingOrThrow').mockResolvedValue({
      id: 'm1',
      workspaceId: 'w1',
      userId: 'u-owner',
      title: 'Entrevue — Analyste',
      startedAt: T0,
      durationMs: 1_800_000,
      publishedAt: null,
      aiOutputs: { summary: 'Bon profil.' },
      settings: opts.settings ?? null,
    });
    jest.spyOn(service, 'listDocuments').mockResolvedValue([] as any);
    jest.spyOn(service, 'getTranscript').mockResolvedValue({
      segments: [{ speaker: 'S1', startMs: 0, text: 'Bonjour' }],
      speakers: { S1: { displayName: 'Marie' } },
    } as any);
    return { service, pages, spaceAbility, updates };
  }

  it('first publication creates the meeting and transcript pages as the caller', async () => {
    const { service, pages, updates } = setup({});
    const res = await service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, user);
    expect(pages.create).toHaveBeenCalledTimes(2);
    expect((pages.create.mock.calls[0] as any[])[0]).toBe('u-pub');
    expect(res.synced).toEqual({ firstPublication: true, meetingPage: 'create', transcriptPage: 'create' });
    const settings = JSON.parse(updates[0].settings);
    expect(settings.publishedBundle).toMatchObject({ meetingPageId: 'new-1', transcriptPageId: 'new-2', spaceId: 'space-1' });
    expect(updates[0].status).toBe('published');
  });

  it('refuses a space the caller cannot write to, before creating anything', async () => {
    const { service, pages } = setup({ canCreate: false });
    await expect(service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(pages.create).not.toHaveBeenCalled();
  });

  it('refuses a space from another workspace and a meeting from another workspace', async () => {
    await expect(setup({ spaceInWorkspace: false }).service.publishBundle('w1', 'm1', { spaceId: 'x' }, user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({}).service.publishBundle('other', 'm1', { spaceId: 'space-1' }, user)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('re-sync refreshes untouched pages, keeps pages edited in Hub, recreates deleted ones', async () => {
    const { service, pages, spaceAbility, updates } = setup({
      settings: {
        publishedBundle: { meetingPageId: 'p-meet', transcriptPageId: 'p-tr', spaceId: 'space-orig', publishedAt: T0, syncedAt: T0 },
      },
      pages: {
        'p-meet': { id: 'p-meet', updatedAt: '2026-10-13T12:00:00.000Z' }, // edited in Hub
        'p-tr': { id: 'p-tr', updatedAt: '2026-10-13T10:00:30.000Z' }, // only our own save
      },
    });
    const res = await service.publishBundle('w1', 'm1', { spaceId: 'space-other' }, user);
    expect(res.synced).toEqual({ firstPublication: false, meetingPage: 'keep', transcriptPage: 'update' });
    expect(pages.create).not.toHaveBeenCalled();
    expect(pages.updatePageContent).toHaveBeenCalledTimes(1);
    expect((pages.updatePageContent.mock.calls[0] as any[]).slice(0, 4)).toEqual(['p-tr', expect.stringContaining('Marie'), 'replace', 'markdown']);
    // The meeting stays in the space it was first filed in.
    expect((spaceAbility.createForUser.mock.calls[0] as any[])[1]).toBe('space-orig');
    const bundle = JSON.parse(updates[0].settings).publishedBundle;
    expect(bundle.publishedAt).toBe(T0);
    expect(bundle.syncedAt).not.toBe(T0);
  });

  it('puts a validated evaluation on the meeting page, never a draft', async () => {
    const evaluation = (status: string) => ({
      status,
      criteria: [{ id: 'experience', label: 'Expérience pertinente' }],
      items: [{ criterionId: 'experience', level: 4, rationale: 'Chiffré.', citations: [{ segmentId: 's1', atMs: 65_000, speaker: 'S1', quote: 'douze jours à cinq' }], comment: '' }],
      overall: { recommendation: 'advance', summary: 'Solide.' },
      generatedAt: T0, transcriptVersion: 1, validatedAt: null, validatedById: null,
    });
    const draft = setup({ settings: { evaluation: evaluation('draft') } });
    await draft.service.publishBundle('w1', 'm1', { spaceId: 'space-1', includeTranscript: false }, user);
    expect((draft.pages.create.mock.calls[0] as any[])[2].content).not.toContain('Évaluation des compétences');
    const ok = setup({ settings: { evaluation: evaluation('validated') } });
    await ok.service.publishBundle('w1', 'm1', { spaceId: 'space-1', includeTranscript: false }, user);
    const content = (ok.pages.create.mock.calls[0] as any[])[2].content as string;
    expect(content).toContain('## Évaluation des compétences');
    expect(content).toContain('| Expérience pertinente | 4/4 · Excellent |');
    expect(content).toContain('— Marie, 01:05');
  });

  it('re-sync recreates a meeting page deleted in Hub', async () => {
    const { service, pages } = setup({
      settings: { publishedBundle: { meetingPageId: 'p-meet', transcriptPageId: null, spaceId: 'space-1', publishedAt: T0 } },
      pages: { 'p-meet': { id: 'p-meet', updatedAt: T0, deletedAt: '2026-10-13T11:00:00.000Z' } },
    });
    const res = await service.publishBundle('w1', 'm1', { spaceId: 'space-1', includeTranscript: false }, user);
    expect(res.synced.meetingPage).toBe('create');
    expect(res.meetingPageId).toBe('new-1');
    expect(pages.create).toHaveBeenCalledTimes(1);
  });
});
