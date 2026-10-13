import { MeetingService } from './meeting.service';
import { BUILTIN_TEMPLATES } from './meeting-template.util';

// Collaborators are doubles below; keep their ESM editor/SDK dependencies out.
jest.mock('../../../core/page/services/page.service', () => ({
  PageService: class {},
}));
jest.mock('../stt/stt.service', () => ({ SttService: class {} }));
jest.mock('../providers/ai-provider.service', () => ({
  AiProviderService: class {},
}));

/**
 * A meeting started with a template keeps a snapshot of it, runs on its
 * base type, and its report is built from the template's sections.
 */
describe('MeetingService with templates', () => {
  const spec = BUILTIN_TEMPLATES['recruitment-interview'].draft;
  const resolved = { id: 'tpl-1', name: 'Entrevue LTC — Cadre', version: 3, baseType: 'recruitment-interview' as const, spec };

  function setup(aiAnswer = '{}') {
    const inserts: any[] = [];
    const updates: any[] = [];
    const deletes: string[] = [];
    const db: any = {
      insertInto: (table: string) => {
        const q: any = {
          values: (v: any) => {
            inserts.push({ table, ...v });
            return q;
          },
          returning: () => q,
          executeTakeFirstOrThrow: async () => ({ id: 'm1', title: 'x', status: 'recording', startedAt: new Date() }),
          executeTakeFirst: async () => ({}),
        };
        return q;
      },
      updateTable: (table: string) => {
        const q: any = {
          set: (v: any) => {
            updates.push({ table, ...v });
            return q;
          },
          where: () => q,
          executeTakeFirst: async () => ({}),
        };
        return q;
      },
      deleteFrom: (table: string) => {
        const q: any = { where: () => q, execute: async () => { deletes.push(table); } };
        return q;
      },
    };
    const ai = { isAvailable: () => true, generate: jest.fn(async () => ({ text: aiAnswer })) };
    const templates = { resolveForMeeting: jest.fn(async () => resolved) };
    const service = new MeetingService(db, {} as any, {} as any, ai as any, {} as any, {} as any, {} as any, {} as any, {} as any, templates as any);
    jest.spyOn(service as any, 'logTransition').mockResolvedValue(undefined);
    return { service, inserts, updates, deletes, ai, templates };
  }

  it('start() snapshots the template and takes its base type', async () => {
    const { service, inserts, templates } = setup();
    await service.start('w1', 'u1', { title: 'Entrevue', consent: true, templateId: 'tpl-1' });
    expect(templates.resolveForMeeting).toHaveBeenCalledWith('w1', 'tpl-1', undefined);
    const row = inserts.find((i) => i.table === 'meetings');
    expect(row.meetingType).toBe('recruitment-interview');
    expect(row.meetingTypeSource).toBe('user');
    const settings = JSON.parse(row.settings);
    expect(settings.template).toMatchObject({ id: 'tpl-1', name: 'Entrevue LTC — Cadre', version: 3 });
    expect(settings.template.spec.sections.length).toBe(spec.sections.length);
  });

  it('the report follows the template sections and refreshes the legacy summary', async () => {
    const answer = JSON.stringify({ sections: { summary: 'Profil solide.', strengths: '- Rigueur', concerns: '- Peu de gestion', compensation: '95 k$', next_steps: '- Deuxième entrevue' } });
    const { service, inserts, updates, deletes, ai } = setup(answer);
    jest.spyOn(service as any, 'getMeetingOrThrow').mockResolvedValue({ id: 'm1', title: 'Entrevue — J. Tremblay', startedAt: '2026-10-13T14:00:00Z', aiOutputs: { actions: '- old' } });
    await (service as any).generateTemplateDocument('m1', resolved, 'Marie: Bonjour.', 2);
    const system = (ai.generate.mock.calls[0] as any[])[0].system as string;
    expect(system).toContain('Règles du modèle : Ne jamais déduire');
    expect(deletes).toEqual(['meetingDocuments']);
    const doc = inserts.find((i) => i.table === 'meetingDocuments');
    expect(doc.title).toBe('Entrevue LTC — Cadre — Entrevue — J. Tremblay');
    expect(doc.templateId).toBe('tpl-1');
    expect(doc.templateVersion).toBe(3);
    expect(doc.contentMarkdown).toContain('## Forces du candidat\n\n- Rigueur');
    expect(doc.contentMarkdown.indexOf('## Résumé')).toBeLessThan(doc.contentMarkdown.indexOf('## Forces du candidat'));
    const outputs = JSON.parse(updates.find((u) => u.table === 'meetings').aiOutputs);
    expect(outputs).toEqual({ actions: '- old', summary: 'Profil solide.', next_steps: '- Deuxième entrevue' });
  });
});
