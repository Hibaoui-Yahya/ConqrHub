import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { MEETING_PUBLISH_SUSPENDED_MESSAGE } from './meeting-access.util';

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
 * LTC Strict Private, phase 0: publishing is suspended for everyone; the
 * publication logic below is kept, and tested with the suspension lifted,
 * for the phase that brings it back.
 */
describe('MeetingService.publishBundle', () => {
  // The creator of the meeting (Strict Private: nobody else publishes it).
  const user = { id: 'u-owner', role: 'member' } as any;
  const T0 = '2026-10-13T10:00:00.000Z';

  function setup(opts: {
    settings?: Record<string, unknown> | null;
    canCreate?: boolean;
    spaceInWorkspace?: boolean;
    pages?: Record<string, { id: string; updatedAt: string; deletedAt?: string | null }>;
    status?: string;
    documents?: Array<{ id: string; title: string; publishBlocker: string | null }>;
    /** Keep the phase-0 suspension (default: lifted, to test the publication). */
    suspended?: boolean;
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
      {} as any,
      { onTransition: async () => undefined, onPublished: async () => undefined } as any,
    );
    jest.spyOn(service as any, 'getMeetingOrThrow').mockImplementation(async (_id: any, o: any) => {
      if (o?.workspaceId && o.workspaceId !== 'w1') throw new NotFoundException('Meeting not found');
      return {
      id: 'm1',
      workspaceId: 'w1',
      userId: 'u-owner',
      status: opts.status ?? 'awaiting_review',
      title: 'Entrevue — Analyste',
      startedAt: T0,
      durationMs: 1_800_000,
      publishedAt: null,
      aiOutputs: { summary: 'Bon profil.' },
      settings: opts.settings ?? null,
      };
    });
    if (!opts.suspended) {
      jest.spyOn(service as any, 'assertPublishingAllowed').mockImplementation(() => undefined);
    }
    jest.spyOn(service as any, 'localeContext').mockResolvedValue({
      language: 'fr',
      sharedTimeZone: 'America/Toronto',
      readerTimeZone: 'America/Toronto',
    });
    jest.spyOn(service as any, 'readDocuments').mockResolvedValue((opts.documents ?? []) as any);
    jest.spyOn(service as any, 'publishDocumentAs').mockImplementation(async (_u: any, _m: any, id: any) => ({
      pageId: `doc-page-${id}`,
      pageUrl: `/p/doc-page-${id}`,
      documentStatus: 'published',
    }));
    jest.spyOn(service as any, 'readTranscript').mockResolvedValue({
      segments: [{ speaker: 'S1', startMs: 0, text: 'Bonjour' }],
      speakers: { S1: { displayName: 'Marie' } },
    } as any);
    return { service, pages, spaceAbility, updates };
  }

  it('first publication creates the meeting and transcript pages as the caller', async () => {
    const { service, pages, updates } = setup({});
    const res = await service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, user);
    expect(pages.create).toHaveBeenCalledTimes(2);
    expect((pages.create.mock.calls[0] as any[])[0]).toBe('u-owner');
    expect(res.synced).toEqual({ firstPublication: true, meetingPage: 'create', transcriptPage: 'create' });
    const settings = JSON.parse(updates[0].settings);
    expect(settings.publishedBundle).toMatchObject({ meetingPageId: 'new-1', transcriptPageId: 'new-2', spaceId: 'space-1' });
    expect(updates[0].status).toBe('published');
  });

  it('is suspended in phase 0: the creator gets 403, before touching Hub', async () => {
    const suspended = setup({ suspended: true });
    const err = await suspended.service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, user).then(() => null, (e) => e);
    expect([err?.constructor?.name, err?.message]).toEqual([ForbiddenException.name, MEETING_PUBLISH_SUSPENDED_MESSAGE]);
    expect(suspended.pages.create).not.toHaveBeenCalled();
    expect(suspended.spaceAbility.createForUser).not.toHaveBeenCalled();
  });

  it('a colleague, an Admin or an Owner gets "not found" for a meeting they did not create, before touching Hub', async () => {
    const { service, pages, spaceAbility } = setup({});
    for (const who of [{ id: 'u-member', role: 'member' }, { id: 'u-admin', role: 'admin' }, { id: 'u-boss', role: 'owner' }]) {
      await expect(service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, who as any)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(pages.create).not.toHaveBeenCalled();
    expect(spaceAbility.createForUser).not.toHaveBeenCalled();
    // The creator still needs the space's own permission (checked next).
    const creator = setup({ canCreate: false });
    await expect(creator.service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, { id: 'u-owner', role: 'member' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(creator.pages.create).not.toHaveBeenCalled();
  });

  it('files every validated document but keeps a failed report in Meet, and refuses while processing', async () => {
    const { service } = setup({
      documents: [
        { id: 'ok', title: 'Notes', publishBlocker: null },
        { id: 'bad', title: 'Rapport', publishBlocker: 'Ce compte rendu est incomplet' },
      ],
    });
    const res = await service.publishBundle('w1', 'm1', { spaceId: 'space-1', includeTranscript: false }, user);
    expect(res.documents.map((d: any) => d.pageId)).toEqual(['doc-page-ok']);
    expect(res.skippedDocuments).toEqual([{ id: 'bad', title: 'Rapport', reason: 'Ce compte rendu est incomplet' }]);
    await expect(
      setup({ status: 'analyzing' }).service.publishBundle('w1', 'm1', { spaceId: 'space-1' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dates the meeting page in the company time zone, with its abbreviation', async () => {
    const { service, pages } = setup({});
    await service.publishBundle('w1', 'm1', { spaceId: 'space-1', includeTranscript: false }, user);
    // 10:00 UTC on 13 Oct 2026 is 06:00 in Toronto (EDT).
    expect((pages.create.mock.calls[0] as any[])[2].content).toContain('13 octobre 2026 à 06 h 00 HAE');
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
