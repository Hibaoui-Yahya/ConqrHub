import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MeetingTemplateService } from './meeting-template.service';
import { BUILTIN_TEMPLATES } from './meeting-template.util';

/**
 * An in-memory `meeting_templates` table behind the Kysely calls the
 * service makes (select/insert/update with where chains). Meetings usage
 * queries return nothing.
 */
function fakeDb() {
  const rows: any[] = [];
  let seq = 0;
  const matches = (row: any, conds: [string, string, any][]) =>
    conds.every(([col, , val]) => (col === 'enabled' ? row.enabled === val : row[col] === val));
  const db: any = {
    rows,
    selectFrom: (table: string) => {
      const conds: [string, string, any][] = [];
      const q: any = {
        select: () => q,
        where: (a: any, b: any, c: any) => {
          if (typeof a === 'string') conds.push([a, b, c]);
          return q;
        },
        orderBy: () => q,
        groupBy: () => q,
        execute: async () => (table === 'meetingTemplates' ? rows.filter((r) => matches(r, conds)) : []),
        executeTakeFirst: async () => (table === 'meetingTemplates' ? rows.find((r) => matches(r, conds)) : undefined),
      };
      return q;
    },
    insertInto: () => {
      let values: any = {};
      const q: any = {
        values: (v: any) => {
          values = v;
          return q;
        },
        returning: () => q,
        executeTakeFirstOrThrow: async () => {
          const row = { id: `t${++seq}`, updatedAt: new Date('2026-10-13T10:00:00Z'), ...values };
          rows.push(row);
          return row;
        },
      };
      return q;
    },
    updateTable: () => {
      let patch: any = {};
      let id: string | null = null;
      const q: any = {
        set: (p: any) => {
          patch = p;
          return q;
        },
        where: (col: string, _op: string, val: any) => {
          if (col === 'id') id = val;
          return q;
        },
        returning: () => q,
        executeTakeFirstOrThrow: async () => {
          const row = rows.find((r) => r.id === id);
          Object.assign(row, patch);
          return row;
        },
        executeTakeFirst: async () => {
          const row = rows.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return row;
        },
      };
      return q;
    },
  };
  return db;
}

describe('MeetingTemplateService', () => {
  const W = 'w1';
  let db: any;
  let service: MeetingTemplateService;
  beforeEach(() => {
    db = fakeDb();
    service = new MeetingTemplateService(db);
  });

  it('lists the five built-ins as published defaults when nothing is customised', async () => {
    const items = await service.list(W);
    expect(items.map((t) => t.id)).toEqual(['generic-meeting', 'daily-standup', 'sprint-planning', 'sales-discovery', 'recruitment-interview']);
    expect(items.every((t) => t.builtin && t.isDefault && t.status === 'published')).toBe(true);
  });

  it('derives a draft from a built-in, keeps its spec, never touches the built-in', async () => {
    const t = await service.create(W, 'u1', { name: 'Entrevue LTC — Cadre', baseId: 'recruitment-interview' });
    expect(t).toMatchObject({ builtin: false, baseType: 'recruitment-interview', status: 'draft', version: 0, published: null, isDefault: false, createdBy: 'u1' });
    expect(t.draft.sections).toEqual(BUILTIN_TEMPLATES['recruitment-interview'].draft.sections);
    expect(db.rows[0].meetingType).toBe('entrevue-ltc-cadre');
    expect(db.rows[0].definition).toEqual(expect.any(String));
    // the slug stays unique
    const t2 = await service.create(W, 'u1', { name: 'Entrevue LTC — Cadre', baseId: 'recruitment-interview' });
    expect(db.rows[1].meetingType).toBe('entrevue-ltc-cadre-2');
    expect(t2.id).not.toBe(t.id);
    await expect(service.update(W, 'u1', 'recruitment-interview', { name: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves the draft sanitised, publishes with a version, and makes it the default of its base type', async () => {
    const t = await service.create(W, 'u1', { name: 'Cadre', baseId: 'recruitment-interview' });
    const saved = await service.update(W, 'u2', t.id, {
      description: ' Pour le forfait Cadre. ',
      spec: { sections: [{ title: 'Résumé', enabled: true }, { title: 'Forces', length: 'detailed' }], rules: 'Citer.', grid: { criteria: ['Anglais'] }, phases: [], markerKinds: ['highlight'] },
    });
    expect(saved.description).toBe('Pour le forfait Cadre.');
    expect(saved.draft.sections.map((s) => s.id)).toEqual(['resume', 'forces']);
    expect(saved.draft.grid.criteria).toEqual([{ id: 'anglais', label: 'Anglais' }]);
    expect(saved.updatedBy).toBe('u2');
    expect(saved.published).toBeNull();
    // not published yet: cannot be the default, and meetings fall back to the base
    await expect(service.setDefault(W, 'u2', t.id, true)).rejects.toBeInstanceOf(BadRequestException);
    const fallback = await service.resolveForMeeting(W, t.id, undefined);
    expect(fallback).toMatchObject({ id: 'recruitment-interview', baseType: 'recruitment-interview' });

    const pub = await service.publish(W, 'u2', t.id);
    expect(pub).toMatchObject({ status: 'published', version: 1 });
    expect(pub.published).toEqual(pub.draft);
    expect(db.rows[0].version).toBe(1);

    const def = await service.setDefault(W, 'u2', t.id, true);
    expect(def.isDefault).toBe(true);
    const items = await service.list(W);
    expect(items.find((x) => x.id === 'recruitment-interview')?.isDefault).toBe(false);
    expect(items.find((x) => x.id === 'generic-meeting')?.isDefault).toBe(true);
    // a meeting of that type without an explicit template now runs on it
    const resolved = await service.resolveForMeeting(W, undefined, 'recruitment-interview');
    expect(resolved).toMatchObject({ id: t.id, version: 1 });
    expect(resolved?.spec.rules).toBe('Citer.');
    // a second default of the same base type unsets the first
    const other = await service.create(W, 'u1', { name: 'Prof', baseId: 'recruitment-interview' });
    await service.publish(W, 'u1', other.id);
    await service.setDefault(W, 'u1', other.id, true);
    expect((await service.get(W, t.id)).isDefault).toBe(false);
    // choosing the built-in again clears the custom default
    await service.setDefault(W, 'u1', 'recruitment-interview', true);
    expect((await service.get(W, other.id)).isDefault).toBe(false);
    expect((await service.get(W, 'recruitment-interview')).isDefault).toBe(true);
  });

  it('refuses to publish without an enabled section, and hides deleted templates', async () => {
    const t = await service.create(W, 'u1', { name: 'Vide', baseId: 'generic-meeting' });
    await service.update(W, 'u1', t.id, { spec: { sections: [{ title: 'A', enabled: false }] } });
    await expect(service.publish(W, 'u1', t.id)).rejects.toBeInstanceOf(BadRequestException);
    await service.remove(W, t.id);
    await expect(service.get(W, t.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.list(W)).some((x) => x.id === t.id)).toBe(false);
    await expect(service.remove(W, 'generic-meeting')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is scoped to the workspace', async () => {
    const t = await service.create(W, 'u1', { name: 'Cadre', baseId: 'recruitment-interview' });
    await expect(service.get('other', t.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.list('other')).every((x) => x.builtin)).toBe(true);
  });
});
