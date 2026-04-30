import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Page, User } from '@docmost/db/types/entity.types';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import { PageAccessService } from '../page-access/page-access.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import {
  CursorPaginationResult,
  emptyCursorPaginationResult,
} from '@docmost/db/pagination/cursor-pagination';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import {
  AddPagePermissionDto,
  RemovePagePermissionDto,
  UpdatePagePermissionRoleDto,
} from '../dto/page-permission.dto';

const ACCESS_LEVEL_RESTRICTED = 'restricted';

export type RestrictionInfoResult = {
  restrictionId?: string;
  hasDirectRestriction: boolean;
  hasInheritedRestriction: boolean;
  inheritedFrom?: {
    id: string;
    slugId: string;
    title: string;
  };
  userAccess: {
    canView: boolean;
    canEdit: boolean;
    canManage: boolean;
  };
};

@Injectable()
export class PagePermissionService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getRestrictionInfo(
    pageId: string,
    user: User,
  ): Promise<RestrictionInfoResult> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');

    const accessLevel =
      await this.pagePermissionRepo.getUserPageAccessLevel(user.id, pageId);

    const direct = await this.pagePermissionRepo.findPageAccessByPageId(pageId);
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    const canManage = ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);

    let inheritedFrom: RestrictionInfoResult['inheritedFrom'];
    if (accessLevel.hasInheritedRestriction) {
      // Find nearest restricted ancestor (depth > 0).
      const nearest = await this.findNearestRestrictedAncestor(pageId);
      if (nearest) {
        inheritedFrom = {
          id: nearest.id,
          slugId: nearest.slugId ?? '',
          title: nearest.title ?? '',
        };
      }
    }

    return {
      restrictionId: direct?.id,
      hasDirectRestriction: accessLevel.hasDirectRestriction,
      hasInheritedRestriction: accessLevel.hasInheritedRestriction,
      inheritedFrom,
      userAccess: {
        canView: accessLevel.canAccess,
        canEdit: accessLevel.canEdit,
        canManage,
      },
    };
  }

  async restrictPage(pageId: string, user: User): Promise<void> {
    const page = await this.assertCanManagePage(pageId, user);

    await this.db.transaction().execute(async (trx) => {
      const existing = await this.pagePermissionRepo.findPageAccessByPageId(
        pageId,
        trx,
      );
      if (existing) return;

      const access = await this.pagePermissionRepo.insertPageAccess(
        {
          pageId: page.id,
          workspaceId: page.workspaceId,
          spaceId: page.spaceId,
          accessLevel: ACCESS_LEVEL_RESTRICTED,
          creatorId: user.id,
        },
        trx,
      );

      // Auto-grant the actor as writer so the page is reachable after restriction.
      await this.pagePermissionRepo.insertPagePermissions(
        [
          {
            pageAccessId: access.id,
            userId: user.id,
            role: 'writer',
            addedById: user.id,
          },
        ],
        trx,
      );
    });

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
    });
  }

  async unrestrictPage(pageId: string, user: User): Promise<void> {
    const page = await this.assertCanManagePage(pageId, user);

    const existing =
      await this.pagePermissionRepo.findPageAccessByPageId(pageId);
    if (!existing) return;

    await this.pagePermissionRepo.deletePageAccess(pageId);

    this.auditService.log({
      event: AuditEvent.PAGE_RESTRICTION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
    });
  }

  async addPermission(
    dto: AddPagePermissionDto,
    user: User,
  ): Promise<void> {
    const userIds = dto.userIds ?? [];
    const groupIds = dto.groupIds ?? [];
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException(
        'At least one user or group must be specified',
      );
    }

    const page = await this.assertCanManagePage(dto.pageId, user);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      dto.pageId,
    );
    if (!access) {
      throw new BadRequestException('Page is not restricted');
    }

    await this.db.transaction().execute(async (trx) => {
      const rows = [
        ...userIds.map((userId) => ({
          pageAccessId: access.id,
          userId,
          role: dto.role,
          addedById: user.id,
        })),
        ...groupIds.map((groupId) => ({
          pageAccessId: access.id,
          groupId,
          role: dto.role,
          addedById: user.id,
        })),
      ];

      // ON CONFLICT DO NOTHING — unique constraints prevent duplicates per
      // (pageAccessId,userId) and (pageAccessId,groupId).
      if (rows.length > 0) {
        await trx
          .insertInto('pagePermissions')
          .values(rows)
          .onConflict((oc) => oc.doNothing())
          .execute();
      }
    });

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_ADDED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: { role: dto.role, userIds, groupIds },
      },
    });
  }

  async removePermission(
    dto: RemovePagePermissionDto,
    user: User,
  ): Promise<void> {
    const userIds = dto.userIds ?? [];
    const groupIds = dto.groupIds ?? [];
    if (userIds.length === 0 && groupIds.length === 0) {
      throw new BadRequestException(
        'At least one user or group must be specified',
      );
    }

    const page = await this.assertCanManagePage(dto.pageId, user);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      dto.pageId,
    );
    if (!access) {
      throw new BadRequestException('Page is not restricted');
    }

    await this.db.transaction().execute(async (trx) => {
      await this.pagePermissionRepo.deletePagePermissionsByUserIds(
        access.id,
        userIds,
        trx,
      );
      await this.pagePermissionRepo.deletePagePermissionsByGroupIds(
        access.id,
        groupIds,
        trx,
      );
    });

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_REMOVED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        before: { userIds, groupIds },
      },
    });
  }

  async updateRole(
    dto: UpdatePagePermissionRoleDto,
    user: User,
  ): Promise<void> {
    if (!dto.userId && !dto.groupId) {
      throw new BadRequestException('userId or groupId is required');
    }

    const page = await this.assertCanManagePage(dto.pageId, user);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(
      dto.pageId,
    );
    if (!access) {
      throw new BadRequestException('Page is not restricted');
    }

    await this.pagePermissionRepo.updatePagePermissionRole(
      access.id,
      dto.role,
      { userId: dto.userId, groupId: dto.groupId },
    );

    this.auditService.log({
      event: AuditEvent.PAGE_PERMISSION_UPDATED,
      resourceType: AuditResource.PAGE,
      resourceId: page.id,
      spaceId: page.spaceId,
      changes: {
        after: { role: dto.role, userId: dto.userId, groupId: dto.groupId },
      },
    });
  }

  async listPermissions(
    pageId: string,
    user: User,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<unknown>> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');

    // Anyone who can read the space can see who has access.
    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const access = await this.pagePermissionRepo.findPageAccessByPageId(pageId);
    if (!access) {
      return emptyCursorPaginationResult(pagination.limit);
    }

    return this.pagePermissionRepo.getPagePermissionsPaginated(
      access.id,
      pagination,
    );
  }

  private async assertCanManagePage(
    pageId: string,
    user: User,
  ): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page) throw new NotFoundException('Page not found');

    // validateCanEdit honours inherited restrictions: a user with space-edit
    // can still be blocked by an ancestor that they aren't a member of.
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }

  private async findNearestRestrictedAncestor(pageId: string): Promise<
    | {
        id: string;
        slugId: string | null;
        title: string | null;
      }
    | undefined
  > {
    const result = await sql<{
      id: string;
      slug_id: string | null;
      title: string | null;
    }>`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_page_id, slug_id, title, 0 AS depth
        FROM pages
        WHERE id = ${pageId}::uuid
        UNION ALL
        SELECT p.id, p.parent_page_id, p.slug_id, p.title, a.depth + 1
        FROM pages p
        JOIN ancestors a ON a.parent_page_id = p.id
      )
      SELECT a.id, a.slug_id, a.title
      FROM ancestors a
      JOIN page_access pa ON pa.page_id = a.id
      WHERE a.depth > 0
      ORDER BY a.depth ASC
      LIMIT 1
    `.execute(this.db);

    const row = result.rows[0];
    if (!row) return undefined;
    return { id: row.id, slugId: row.slug_id, title: row.title };
  }
}
