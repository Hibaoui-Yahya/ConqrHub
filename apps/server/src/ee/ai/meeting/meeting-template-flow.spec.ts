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
      // Reads inside a write transaction (the legacy outputs refresh).
      selectFrom: () => {
        const q: any = {
          select: () => q,
          where: () => q,
          executeTakeFirstOrThrow: async () => ({ aiOutputs: { actions: '- old' } }),
        };
        return q;
      },
      transaction: () => ({ execute: async (fn: (trx: any) => Promise<unknown>) => fn(db) }),
    };
    const ai = { isAvailable: () => true, generate: jest.fn(async () => ({ text: aiAnswer })) };
    const templates = { resolveForMeeting: jest.fn(async () => resolved) };
    const service = new MeetingService(db, {} as any, {} as any, ai as any, {} as any, {} as any, {} as any, {} as any, {} as any, templates as any, { onTransition: async () => undefined, onPublished: async () => undefined } as any);
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

  describe('validated report generation (LTC-02)', () => {
    const generic = { id: 'generic-meeting', name: 'Réunion générale', version: 1, baseType: 'generic-meeting' as const, spec: BUILTIN_TEMPLATES['generic-meeting'].draft };
    const conversation = 'Marie: Le budget est de 45 000 $. Paul: On lance la phase deux en novembre. '.repeat(4);
    const full = JSON.stringify({ sections: { summary: 'Budget 45 000 $.', decisions: '- Phase deux', actions: '- [Marie] Plan', next_steps: '- Jeudi' } });

    function run(answers: Array<string | Error>, opts: { json?: unknown; transcript?: string } = {}) {
      const t = setup();
      jest.spyOn(t.service as any, 'getMeetingOrThrow').mockResolvedValue({ id: 'm1', title: 'Point Atlas', startedAt: '2026-10-13T15:05:00Z', aiOutputs: {} });
      for (const a of answers) {
        if (a instanceof Error) t.ai.generate.mockRejectedValueOnce(a);
        else t.ai.generate.mockResolvedValueOnce({ text: a });
      }
      if (opts.json !== undefined) (t.ai as any).generateJson = jest.fn(async () => ({ text: '', json: opts.json }));
      const result = (t.service as any).generateTemplateDocument('m1', generic, opts.transcript ?? conversation, 1, { language: 'fr', timeZone: 'America/Toronto' });
      return { ...t, result };
    }
    const docOf = (inserts: any[]) => inserts.find((i) => i.table === 'meetingDocuments');

    it('uses the provider JSON mode when available', async () => {
      const t = run([], { json: JSON.parse(full) });
      expect(await t.result).toBeNull();
      expect((t.ai as any).generateJson).toHaveBeenCalledTimes(1);
      expect(t.ai.generate).not.toHaveBeenCalled();
      const doc = docOf(t.inserts);
      expect(doc.contentMarkdown).toContain(['## Résumé', '', 'Budget 45 000 $.'].join('\n'));
      // The report names the company zone (LTC-05): 15:05 UTC = 11:05 EDT.
      expect(doc.contentMarkdown).toContain('_13 octobre 2026 à 11 h 05 HAE · Réunion générale_');
      expect(JSON.parse(doc.structured).generation).toMatchObject({ status: 'complete', attempts: 1, language: 'fr' });
    });

    it('retries a malformed answer and keeps the good one', async () => {
      const t = run(['Voici : {summary => ...', ['```json', full, '```'].join('\n')]);
      expect(await t.result).toBeNull();
      expect(t.ai.generate).toHaveBeenCalledTimes(2);
      expect((t.ai.generate.mock.calls[1] as any[])[0].prompt).toContain('Ta réponse précédente était inutilisable');
      expect(docOf(t.inserts).contentMarkdown).not.toContain('_Rien de consigné._');
    });

    it('stops after the bounded attempts and writes no fake empty report', async () => {
      const t = run(['nope', new Error('provider 502'), '{"autre": 1}']);
      const error = await t.result;
      expect(error).toContain('n’a pas pu être généré');
      expect(t.ai.generate).toHaveBeenCalledTimes(3);
      expect(docOf(t.inserts)).toBeUndefined();
      expect(t.deletes).toEqual([]); // the previous drafts are kept
    });

    it('completes missing sections from a second answer', async () => {
      const t = run([
        JSON.stringify({ sections: { summary: 'Budget 45 000 $.', decisions: '- Phase deux' } }),
        JSON.stringify({ sections: { actions: '- [Marie] Plan', next_steps: '- Jeudi', summary: '_Rien de consigné._' } }),
      ]);
      expect(await t.result).toBeNull();
      const doc = docOf(t.inserts);
      expect(JSON.parse(doc.structured).sections).toEqual({ summary: 'Budget 45 000 $.', decisions: '- Phase deux', actions: '- [Marie] Plan', next_steps: '- Jeudi' });
    });

    it('marks a report that stays incomplete as partial (not publishable) and names the gaps', async () => {
      const partial = JSON.stringify({ sections: { summary: 'Budget 45 000 $.' } });
      const t = run([partial, partial, partial]);
      const error = await t.result;
      expect(error).toContain('incomplet');
      expect(error).toContain('Décisions');
      const doc = docOf(t.inserts);
      expect(JSON.parse(doc.structured).generation.status).toBe('partial');
      expect(doc.contentMarkdown).toContain('_Section non générée : relancez l’analyse._');
      expect(doc.contentMarkdown).not.toContain('_Rien de consigné._');
    });

    it('accepts an honestly empty short meeting without hallucinating', async () => {
      const empty = JSON.stringify({ sections: { summary: 'Brève prise de contact.', decisions: '_Rien de consigné._', actions: '_Rien de consigné._', next_steps: '_Rien de consigné._' } });
      const t = run([empty], { transcript: 'Marie: Bonjour. Paul: Bonjour.' });
      expect(await t.result).toBeNull();
      expect(t.ai.generate).toHaveBeenCalledTimes(1);
      expect(JSON.parse(docOf(t.inserts).structured).generation.emptySections).toEqual(['decisions', 'actions', 'next_steps']);
    });

    it('does not trust an all-empty report of a real conversation', async () => {
      const allEmpty = JSON.stringify({ sections: { summary: '_Rien de consigné._', decisions: '_Rien de consigné._', actions: '_Rien de consigné._', next_steps: '_Rien de consigné._' } });
      const t = run([allEmpty, allEmpty, allEmpty]);
      expect(await t.result).toContain('revenu vide');
      expect(t.ai.generate).toHaveBeenCalledTimes(3);
      expect(docOf(t.inserts)).toBeUndefined();
    });
  });
});
