import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
 * Competency evaluation: generation stores a draft with verified citations,
 * the recruiter's edits are the record, a validated evaluation is protected
 * and is the only one that reaches the Hub page.
 */
describe('MeetingService evaluation', () => {
  // The meeting's creator; Owners/Admins may also edit (LTC-03).
  const owner = { id: 'u-owner', role: 'member', workspaceId: 'w1' };
  const segments = [
    { id: 's1', speaker: 'S1', startMs: 0, endMs: 4000, text: 'Parlez-moi d’un projet dont vous êtes fière.' },
    { id: 's2', speaker: 'S2', startMs: 65_000, endMs: 80_000, text: 'Le délai de clôture est passé de douze jours à cinq.' },
  ];
  const speakers = { S2: { displayName: 'Candidate' } };

  function setup(opts: { settings?: Record<string, unknown> | null; aiAnswer?: string; aiAvailable?: boolean }) {
    const updates: any[] = [];
    const db: any = {
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
    const ai = {
      isAvailable: () => opts.aiAvailable !== false,
      generate: jest.fn(async () => ({ text: opts.aiAnswer ?? '{}' })),
    };
    const service = new MeetingService(
      db,
      {} as any,
      {} as any,
      ai as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { onTransition: async () => undefined, onPublished: async () => undefined } as any,
    );
    jest.spyOn(service as any, 'getMeetingOrThrow').mockImplementation(async (_id: any, o: any) => {
      if (o?.workspaceId && o.workspaceId !== 'w1') throw new NotFoundException('Meeting not found');
      return {
      id: 'm1',
      workspaceId: 'w1',
      userId: 'u-owner',
      title: 'Entrevue — Analyste',
      settings: opts.settings ?? null,
      };
    });
    jest.spyOn(service as any, 'readTranscript').mockResolvedValue({ version: 2, segments, speakers } as any);
    return { service, ai, updates };
  }

  const goodAnswer = JSON.stringify({
    criteria: [
      { id: 'experience', level: 4, rationale: 'Chiffré.', citations: [{ segmentId: 's2', quote: 'passé de douze jours à cinq' }] },
      { id: 'skills', level: 3, rationale: 'Supposé.', citations: [{ segmentId: 's2', quote: 'a doublé le chiffre d’affaires' }] },
    ],
    overall: { recommendation: 'advance', summary: 'Solide.' },
  });

  it('generates a draft with verified citations and stores it in settings', async () => {
    const { service, ai, updates } = setup({ aiAnswer: goodAnswer, settings: { markers: [] } });
    const ev = await service.generateEvaluation(owner, 'm1', ['Expérience pertinente', 'Compétences techniques']);
    expect((ai.generate.mock.calls[0] as any[])[0].prompt).toContain('[s2 01:05 Candidate]');
    expect(ev.status).toBe('draft');
    expect(ev.items[0]).toMatchObject({ criterionId: 'experience', level: 4 });
    expect(ev.items[0].citations[0]).toMatchObject({ segmentId: 's2', atMs: 65_000 });
    expect(ev.items[1]).toMatchObject({ criterionId: 'skills', level: null, citations: [] });
    expect(ev.transcriptVersion).toBe(2);
    const stored = JSON.parse(updates[0].settings);
    expect(stored.markers).toEqual([]); // other settings untouched
    expect(stored.evaluation.items).toHaveLength(2);
  });

  it('keeps the recruiter comments across a regeneration', async () => {
    const { service } = setup({
      aiAnswer: goodAnswer,
      settings: { evaluation: { status: 'draft', criteria: [{ id: 'experience', label: 'x' }], items: [{ criterionId: 'experience', level: 2, rationale: '', citations: [], comment: 'Vérifier les références.' }], overall: { recommendation: null, summary: '' }, generatedAt: null, transcriptVersion: null, validatedAt: null, validatedById: null } },
    });
    const ev = await service.generateEvaluation(owner, 'm1', undefined);
    expect(ev.items.find((i) => i.criterionId === 'experience')?.comment).toBe('Vérifier les références.');
  });

  it('refuses to regenerate over a validated evaluation, another workspace, no transcript, no AI', async () => {
    const validated = { evaluation: { status: 'validated', criteria: [], items: [], overall: {}, generatedAt: null, transcriptVersion: null, validatedAt: 'x', validatedById: 'u' } };
    await expect(setup({ settings: validated }).service.generateEvaluation(owner, 'm1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({}).service.generateEvaluation({ ...owner, workspaceId: 'other' }, 'm1', undefined)).rejects.toBeInstanceOf(NotFoundException);
    const noAi = setup({ aiAvailable: false });
    await expect(noAi.service.generateEvaluation(owner, 'm1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    const noTr = setup({});
    ((noTr.service as any).readTranscript as jest.Mock).mockResolvedValue({ version: 1, segments: [], speakers: {} });
    await expect(noTr.service.generateEvaluation(owner, 'm1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(noTr.ai.generate).not.toHaveBeenCalled();
  });

  it('lets coworkers read but not generate or edit the evaluation of a meeting they did not create', async () => {
    const coworker = { id: 'u-other', role: 'member', workspaceId: 'w1' };
    const { service, ai, updates } = setup({ aiAnswer: goodAnswer });
    await expect(service.generateEvaluation(coworker, 'm1', undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.saveEvaluation(coworker, 'm1', { status: 'validated' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(ai.generate).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    const ev = await service.generateEvaluation({ ...coworker, role: 'owner' }, 'm1', undefined);
    expect(ev.status).toBe('draft');
  });

  it('saves the recruiter edits and validation, and refuses without a generated evaluation', async () => {
    const { service, updates } = setup({ aiAnswer: goodAnswer });
    await service.generateEvaluation(owner, 'm1', undefined);
    const stored = JSON.parse(updates[0].settings);
    const { service: s2, updates: u2 } = setup({ settings: stored });
    const ev = await s2.saveEvaluation({ id: 'u-rec', role: 'admin', workspaceId: 'w1' }, 'm1', { status: 'validated', items: [{ criterionId: 'skills', level: 2, comment: 'Vu au CV.' }] });
    expect(ev.status).toBe('validated');
    expect(ev.validatedById).toBe('u-rec');
    expect(ev.items.find((i) => i.criterionId === 'skills')).toMatchObject({ level: 2, comment: 'Vu au CV.' });
    expect(JSON.parse(u2[0].settings).evaluation.status).toBe('validated');
    await expect(setup({}).service.saveEvaluation(owner, 'm1', {})).rejects.toBeInstanceOf(BadRequestException);
  });
});
