import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  BASE_TYPES,
  BUILTIN_TEMPLATES,
  builtinTemplate,
  isBuiltinId,
  normalizeTemplateSpec,
  slugify,
  type BaseType,
  type MeetingTemplate,
  type TemplateDefinition,
  type TemplateSpec,
} from './meeting-template.util';

/**
 * Custom templates are rows of `meeting_templates` (one per workspace and
 * slug — the `meeting_type` column holds the slug, `definition` the
 * TemplateDefinition, `version` the published version, `enabled` false once
 * deleted). Built-in templates are code; they are never written.
 *
 * Business rules:
 * - a built-in template is never modified: "Personnaliser" derives a copy;
 * - a draft is private to the editor until "Publier", which bumps the version;
 * - a meeting keeps a snapshot of the published spec it was started with;
 * - one default template per base type (the built-in one unless chosen).
 */
@Injectable()
export class MeetingTemplateService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private parse(def: unknown): TemplateDefinition {
    return (typeof def === 'string' ? JSON.parse(def) : def) as TemplateDefinition;
  }

  private rowToTemplate(row: { id: string; definition: unknown; updatedAt: Date | string | null }): MeetingTemplate {
    const def = this.parse(row.definition);
    return {
      id: row.id,
      builtin: false,
      ...def,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }

  private async customRows(workspaceId: string) {
    return this.db
      .selectFrom('meetingTemplates')
      .select(['id', 'meetingType', 'definition', 'version', 'updatedAt'])
      .where('workspaceId', '=', workspaceId)
      .where('enabled', '=', true)
      .orderBy('updatedAt', 'desc')
      .execute();
  }

  /** Meetings started with each template since the 1st of the month. */
  private async usage(workspaceId: string): Promise<Record<string, number>> {
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    const rows = await this.db
      .selectFrom('meetings')
      .select([
        sql<string>`coalesce(settings->'template'->>'id', meeting_type)`.as('key'),
        sql<string>`count(*)::int`.as('count'),
      ])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .where('startedAt', '>=', since)
      .groupBy(sql`coalesce(settings->'template'->>'id', meeting_type)`)
      .execute()
      .catch(() => [] as { key: string; count: string }[]);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.key] = Number(r.count) || 0;
    return out;
  }

  async list(workspaceId: string): Promise<MeetingTemplate[]> {
    const [rows, usage] = await Promise.all([this.customRows(workspaceId), this.usage(workspaceId)]);
    const custom = rows.map((r) => this.rowToTemplate(r));
    const defaultsByBase = new Set(custom.filter((t) => t.isDefault).map((t) => t.baseType));
    const builtins = BASE_TYPES.map((id) => builtinTemplate(id, !defaultsByBase.has(id)));
    return [...custom, ...builtins].map((t) => ({ ...t, usageThisMonth: usage[t.id] ?? 0 }));
  }

  async get(workspaceId: string, id: string): Promise<MeetingTemplate> {
    if (isBuiltinId(id)) {
      const custom = await this.customRows(workspaceId);
      const hasDefault = custom.some((r) => {
        const d = this.parse(r.definition);
        return d.isDefault && d.baseType === id;
      });
      return builtinTemplate(id, !hasDefault);
    }
    const row = await this.db
      .selectFrom('meetingTemplates')
      .select(['id', 'definition', 'updatedAt'])
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('enabled', '=', true)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Template not found');
    return this.rowToTemplate(row);
  }

  /**
   * The spec a new meeting runs with: the default template of the base
   * type when none is named. Returns null for a base type without template
   * (never happens for the built-in types).
   */
  async resolveForMeeting(
    workspaceId: string,
    templateId: string | undefined,
    meetingType: string | undefined,
  ): Promise<{ id: string; name: string; version: number; baseType: BaseType; spec: TemplateSpec } | null> {
    let t: MeetingTemplate | null = null;
    if (templateId) {
      t = await this.get(workspaceId, templateId).catch(() => null);
    }
    if (!t) {
      const base = (meetingType && isBuiltinId(meetingType) ? meetingType : 'generic-meeting') as BaseType;
      const all = await this.list(workspaceId);
      t = all.find((x) => x.baseType === base && x.isDefault && (x.builtin || x.published)) ?? builtinTemplate(base, true);
    }
    const spec = t.published ?? (t.builtin ? t.draft : null);
    if (!spec) {
      // A never-published draft: fall back to its base so the meeting still works.
      const base = builtinTemplate(t.baseType, true);
      return { id: base.id, name: base.name, version: base.version, baseType: base.baseType, spec: base.draft };
    }
    return { id: t.id, name: t.name, version: t.version, baseType: t.baseType, spec };
  }

  private async uniqueSlug(workspaceId: string, name: string): Promise<string> {
    const base = slugify(name) || 'modele';
    const rows = await this.db
      .selectFrom('meetingTemplates')
      .select(['meetingType'])
      .where('workspaceId', '=', workspaceId)
      .execute();
    const taken = new Set(rows.map((r) => r.meetingType));
    let slug = base;
    for (let i = 2; taken.has(slug) || isBuiltinId(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  async create(workspaceId: string, userId: string, input: { name: string; baseId: string }): Promise<MeetingTemplate> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('A name is required');
    const source = await this.get(workspaceId, input.baseId);
    const spec = source.published ?? source.draft;
    const def: TemplateDefinition = {
      name,
      description: source.builtin ? `Dérivé de « ${source.name} ».` : source.description,
      icon: source.icon,
      baseType: source.baseType,
      sensitivity: source.sensitivity,
      isDefault: false,
      status: 'draft',
      version: 0,
      draft: JSON.parse(JSON.stringify(spec)),
      published: null,
      publishedAt: null,
      createdBy: userId,
      updatedBy: userId,
    };
    const row = await this.db
      .insertInto('meetingTemplates')
      .values({
        workspaceId,
        meetingType: await this.uniqueSlug(workspaceId, name),
        level: 'organization',
        ownerId: null,
        version: 0,
        definition: JSON.stringify(def),
        enabled: true,
      })
      .returning(['id', 'definition', 'updatedAt'])
      .executeTakeFirstOrThrow();
    return this.rowToTemplate(row);
  }

  private async customRowOrThrow(workspaceId: string, id: string) {
    if (isBuiltinId(id)) throw new BadRequestException('Built-in templates cannot be modified. Customise a copy.');
    const row = await this.db
      .selectFrom('meetingTemplates')
      .select(['id', 'definition', 'version', 'updatedAt'])
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .where('enabled', '=', true)
      .executeTakeFirst();
    if (!row) throw new NotFoundException('Template not found');
    return { row, def: this.parse(row.definition) };
  }

  private async save(id: string, def: TemplateDefinition, version?: number): Promise<MeetingTemplate> {
    const row = await this.db
      .updateTable('meetingTemplates')
      .set({ definition: JSON.stringify(def), updatedAt: new Date(), ...(version !== undefined ? { version } : {}) })
      .where('id', '=', id)
      .returning(['id', 'definition', 'updatedAt'])
      .executeTakeFirstOrThrow();
    return this.rowToTemplate(row);
  }

  async update(
    workspaceId: string,
    userId: string,
    id: string,
    input: { name?: string; description?: string; icon?: string; sensitivity?: TemplateDefinition['sensitivity']; spec?: unknown },
  ): Promise<MeetingTemplate> {
    const { def } = await this.customRowOrThrow(workspaceId, id);
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException('A name is required');
      def.name = name;
    }
    if (input.description !== undefined) def.description = input.description.trim();
    if (input.icon !== undefined) def.icon = input.icon.trim() || def.icon;
    if (input.sensitivity !== undefined) def.sensitivity = input.sensitivity;
    if (input.spec !== undefined) def.draft = normalizeTemplateSpec(input.spec, BUILTIN_TEMPLATES[def.baseType].draft);
    def.status = 'draft';
    def.updatedBy = userId;
    return this.save(id, def);
  }

  /** The draft becomes the published spec; new meetings use it from now on. */
  async publish(workspaceId: string, userId: string, id: string): Promise<MeetingTemplate> {
    const { def } = await this.customRowOrThrow(workspaceId, id);
    if (!def.draft.sections.some((s) => s.enabled)) {
      throw new BadRequestException('Enable at least one section before publishing.');
    }
    def.published = JSON.parse(JSON.stringify(def.draft));
    def.version = (def.version || 0) + 1;
    def.status = 'published';
    def.publishedAt = new Date().toISOString();
    def.updatedBy = userId;
    return this.save(id, def, def.version);
  }

  /** One default per base type: setting one unsets the others. */
  async setDefault(workspaceId: string, userId: string, id: string, isDefault: boolean): Promise<MeetingTemplate> {
    if (isBuiltinId(id)) {
      // The built-in is the default when no custom template of its type is.
      const rows = await this.customRows(workspaceId);
      for (const r of rows) {
        const d = this.parse(r.definition);
        if (d.baseType === id && d.isDefault) {
          d.isDefault = false;
          await this.save(r.id, d);
        }
      }
      return this.get(workspaceId, id);
    }
    const { def } = await this.customRowOrThrow(workspaceId, id);
    if (isDefault && !def.published) throw new BadRequestException('Publish the template before making it the default.');
    if (isDefault) {
      const rows = await this.customRows(workspaceId);
      for (const r of rows) {
        if (r.id === id) continue;
        const d = this.parse(r.definition);
        if (d.baseType === def.baseType && d.isDefault) {
          d.isDefault = false;
          await this.save(r.id, d);
        }
      }
    }
    def.isDefault = isDefault;
    def.updatedBy = userId;
    return this.save(id, def);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const { row } = await this.customRowOrThrow(workspaceId, id);
    await this.db.updateTable('meetingTemplates').set({ enabled: false, updatedAt: new Date() }).where('id', '=', row.id).executeTakeFirst();
  }
}
