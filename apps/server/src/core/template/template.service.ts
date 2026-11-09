import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { UserRole } from '../../common/helpers/types/permission';
import { PageService } from '../page/services/page.service';
import { PageAccessService } from '../page/page-access/page-access.service';
import { jsonToNode, jsonToText } from '../../collaboration/collaboration.util';
import { TemplateRepo } from './template.repo';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Page templates. A template is company-wide (`spaceId` null) or belongs to
 * one space.
 * - Seeing and using one: company-wide ones are open to every member; a
 *   space template to the members of that space.
 * - Creating, editing, deleting: company-wide ones are for workspace admins;
 *   a space template for the space admins, and for the space writers when
 *   the company allows members to manage templates.
 * - Using one creates a page, with the same rights as creating a page there.
 */
@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  private isWorkspaceAdmin(user: User): boolean {
    return user.role === UserRole.OWNER || user.role === UserRole.ADMIN;
  }

  private membersMayManage(workspace: Workspace): boolean {
    const settings = workspace.settings as Record<string, any> | null;
    return settings?.templates?.allowMemberTemplates === true;
  }

  async canManage(
    user: User,
    workspace: Workspace,
    spaceId: string | null | undefined,
  ): Promise<boolean> {
    if (this.isWorkspaceAdmin(user)) return true;
    if (!spaceId) return false;
    const ability = await this.spaceAbility
      .createForUser(user, spaceId)
      .catch(() => null);
    if (!ability) return false;
    if (ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      return true;
    }
    return (
      this.membersMayManage(workspace) &&
      ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Page)
    );
  }

  private async assertCanManage(
    user: User,
    workspace: Workspace,
    spaceId: string | null | undefined,
  ) {
    if (!(await this.canManage(user, workspace, spaceId))) {
      throw new ForbiddenException(
        spaceId
          ? 'You cannot manage the templates of this space'
          : 'Only workspace admins can manage company-wide templates',
      );
    }
  }

  private async assertCanSee(user: User, spaceId: string | null) {
    if (!spaceId) return;
    const ability = await this.spaceAbility
      .createForUser(user, spaceId)
      .catch(() => null);
    if (!ability || ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      // Same answer as a template that does not exist.
      throw new NotFoundException('Template not found');
    }
  }

  private parseContent(content: unknown) {
    const doc = content ?? EMPTY_DOC;
    try {
      jsonToNode(doc as any);
    } catch {
      throw new BadRequestException('Invalid template content');
    }
    return { content: doc as any, textContent: jsonToText(doc as any) };
  }

  async list(dto: ListTemplatesDto, user: User, workspace: Workspace) {
    if (dto.spaceId) {
      const ability = await this.spaceAbility
        .createForUser(user, dto.spaceId)
        .catch(() => null);
      if (!ability || ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }
    return this.templateRepo.list({
      userId: user.id,
      workspaceId: workspace.id,
      spaceId: dto.spaceId,
      query: dto.query,
      limit: dto.limit ?? 30,
      cursor: dto.cursor,
      beforeCursor: dto.beforeCursor,
    });
  }

  async get(templateId: string, user: User, workspace: Workspace) {
    const template = await this.templateRepo.findById(templateId, workspace.id, {
      includeContent: true,
    });
    if (!template) throw new NotFoundException('Template not found');
    await this.assertCanSee(user, template.spaceId);
    return template;
  }

  async create(dto: CreateTemplateDto, user: User, workspace: Workspace) {
    const spaceId = dto.spaceId ?? null;
    await this.assertCanManage(user, workspace, spaceId);
    const { content, textContent } = this.parseContent(dto.content);

    const inserted = await this.templateRepo.insert({
      title: dto.title.trim(),
      description: dto.description ?? null,
      icon: dto.icon ?? null,
      content,
      textContent,
      spaceId,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
    });
    return this.templateRepo.findById(inserted.id, workspace.id, {
      includeContent: true,
    });
  }

  async update(dto: UpdateTemplateDto, user: User, workspace: Workspace) {
    const existing = await this.get(dto.templateId, user, workspace);
    await this.assertCanManage(user, workspace, existing.spaceId);

    const values: Record<string, unknown> = {
      lastUpdatedById: user.id,
      updatedAt: new Date(),
    };
    if (dto.title !== undefined) values.title = dto.title.trim();
    if (dto.description !== undefined) values.description = dto.description;
    if (dto.icon !== undefined) values.icon = dto.icon;
    if (dto.content !== undefined) {
      Object.assign(values, this.parseContent(dto.content));
    }
    if (dto.spaceId !== undefined && dto.spaceId !== existing.spaceId) {
      // Moving a template takes the right to manage both scopes.
      await this.assertCanManage(user, workspace, dto.spaceId);
      values.spaceId = dto.spaceId;
    }

    await this.templateRepo.update(existing.id, workspace.id, values);
    return this.templateRepo.findById(existing.id, workspace.id, {
      includeContent: true,
    });
  }

  async delete(templateId: string, user: User, workspace: Workspace) {
    const existing = await this.get(templateId, user, workspace);
    await this.assertCanManage(user, workspace, existing.spaceId);
    await this.templateRepo.softDelete(existing.id, workspace.id);
  }

  /** Create a page from a template, where the user may create pages. */
  async use(dto: UseTemplateDto, user: User, workspace: Workspace): Promise<Page> {
    const template = await this.get(dto.templateId, user, workspace);

    // A space template is only offered inside its own space.
    if (template.spaceId && template.spaceId !== dto.spaceId) {
      throw new BadRequestException('This template belongs to another space');
    }

    if (dto.parentPageId) {
      const parent = await this.pageRepo.findById(dto.parentPageId);
      if (
        !parent ||
        parent.deletedAt ||
        parent.workspaceId !== workspace.id ||
        parent.spaceId !== dto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parent, user);
    } else {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    return this.pageService.create(user.id, workspace.id, {
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      title: template.title ?? undefined,
      icon: template.icon ?? undefined,
      content: (template.content as object) ?? EMPTY_DOC,
      format: 'json',
    });
  }
}
