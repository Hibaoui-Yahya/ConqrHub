import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { getPageTitle } from '../../common/helpers';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import {
  AuditEvent,
  AuditResource,
} from '../../common/events/audit-events';
import {
  CreateVerificationDto,
  UpdateVerificationDto,
  VerificationInfoDto,
  VerificationsListDto,
} from './dto/page-verification.dto';

const EXPIRING_WINDOW_DAYS = 7;
const MAX_VERIFIERS = 5;

@Injectable()
export class PageVerificationService {
  private readonly logger = new Logger(PageVerificationService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE) private notificationQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  /**
   * Re-syncs a page's RAG embeddings to its current verification state. The
   * indexer is self-correcting: it indexes a verified page and removes
   * embeddings for an unverified one, so a single re-index job covers both
   * "just verified -> add to RAG" and "no longer verified -> drop from RAG".
   */
  private async enqueueRagSync(pageId: string, workspaceId: string) {
    try {
      await this.aiQueue.add(QueueJob.GENERATE_PAGE_EMBEDDINGS, {
        pageIds: [pageId],
        workspaceId,
      });
    } catch (err) {
      this.logger.error(`Failed to enqueue RAG sync for page ${pageId}`, err);
    }
  }

  /**
   * Called when a page's content changes. Any currently-valid verification is
   * reset to draft so the page must be re-verified before its (now changed)
   * content can re-enter the knowledge base. Returns the pageIds that were
   * actually invalidated.
   */
  async invalidateOnContentChange(pageIds: string[]): Promise<string[]> {
    if (pageIds.length === 0) return [];
    const affected = await this.db
      .updateTable('pageVerifications')
      .set({ status: 'draft', updatedAt: new Date() })
      .where('pageId', 'in', pageIds)
      .where('status', 'in', ['verified', 'expiring', 'approved'])
      .returning('pageId')
      .execute();
    return affected.map((r) => r.pageId);
  }

  async getVerificationInfo(dto: VerificationInfoDto, user: User) {
    const page = await this.db.selectFrom('pages').select(['id', 'spaceId'])
      .where('id', '=', dto.pageId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!page) throw new NotFoundException('Page not found');

    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', dto.pageId).executeTakeFirst();

    if (!verification) {
      const perm = await this.getPermissions(dto.pageId, page.spaceId, null, [], user);
      return { status: 'none', permissions: perm };
    }

    const verifiers = await this.getVerifiers(verification.id);
    const effectiveStatus = this.computeEffectiveStatus(verification);
    const perm = await this.getPermissions(dto.pageId, page.spaceId, verification, verifiers, user);

    return {
      id: verification.id, pageId: verification.pageId, type: verification.type,
      mode: verification.mode, periodAmount: verification.periodAmount, periodUnit: verification.periodUnit,
      status: effectiveStatus,
      verifiedAt: verification.verifiedAt ? verification.verifiedAt.toISOString() : null,
      verifiedBy: verification.verifiedById ? await this.getUserRef(verification.verifiedById) : null,
      expiresAt: verification.expiresAt ? verification.expiresAt.toISOString() : null,
      requestedAt: verification.requestedAt ? verification.requestedAt.toISOString() : null,
      requestedBy: verification.requestedById ? await this.getUserRef(verification.requestedById) : null,
      rejectedAt: verification.rejectedAt ? verification.rejectedAt.toISOString() : null,
      rejectedBy: verification.rejectedById ? await this.getUserRef(verification.rejectedById) : null,
      rejectionComment: verification.rejectionComment ?? null,
      verifiers: verifiers.map((v: any) => ({ id: v.userId, name: v.name, avatarUrl: v.avatarUrl, email: v.email })),
      permissions: perm,
    };
  }

  async createVerification(dto: CreateVerificationDto, user: User, workspace: Workspace) {
    const page = await this.db.selectFrom('pages').select(['id', 'spaceId'])
      .where('id', '=', dto.pageId).where('deletedAt', 'is', null).executeTakeFirst();
    if (!page) throw new NotFoundException('Page not found');
    await this.assertCanManage(page.spaceId, user, workspace);

    const existing = await this.db.selectFrom('pageVerifications').select('id')
      .where('pageId', '=', dto.pageId).executeTakeFirst();
    if (existing) throw new BadRequestException('Verification already exists for this page');
    if (dto.verifierIds.length === 0) throw new BadRequestException('At least one verifier is required');
    if (dto.verifierIds.length > MAX_VERIFIERS) throw new BadRequestException('Maximum ' + MAX_VERIFIERS + ' verifiers allowed');

    const type = dto.type ?? 'expiring';
    const mode = dto.mode ?? null;
    const now = new Date();
    const expiresAt = this.calculateExpiresAt(mode, dto.periodAmount, dto.periodUnit, dto.fixedExpiresAt);

    const result = await this.db.insertInto('pageVerifications').values({
      pageId: dto.pageId, workspaceId: workspace.id, spaceId: page.spaceId, type,
      status: 'draft', mode, periodAmount: dto.periodAmount ?? null, periodUnit: dto.periodUnit ?? null,
      expiresAt, creatorId: user.id, createdAt: now, updatedAt: now,
    }).returning('id').executeTakeFirstOrThrow();

    const verifierRows = dto.verifierIds.map((userId: string) => ({ pageVerificationId: result.id, userId, addedById: user.id }));
    await this.db.insertInto('pageVerifiers').values(verifierRows).execute();
    await this.scheduleReconcile();

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_VERIFICATION_CREATED, resourceType: AuditResource.PAGE,
      resourceId: dto.pageId, spaceId: page.spaceId,
    }, { workspaceId: workspace.id, actorId: user.id, actorType: 'user' });
  }

  async updateVerification(dto: UpdateVerificationDto, user: User, workspace: Workspace) {
    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', dto.pageId).executeTakeFirst();
    if (!verification) throw new NotFoundException('Verification not found');
    await this.assertCanManage(verification.spaceId, user, workspace);

    const expiresAt = this.calculateExpiresAt(dto.mode ?? verification.mode,
      dto.periodAmount ?? verification.periodAmount, dto.periodUnit ?? verification.periodUnit, dto.fixedExpiresAt);

    await this.db.updateTable('pageVerifications').set({
      mode: dto.mode ?? verification.mode, periodAmount: dto.periodAmount ?? verification.periodAmount,
      periodUnit: dto.periodUnit ?? verification.periodUnit, expiresAt, updatedAt: new Date(),
    }).where('id', '=', verification.id).execute();

    if (dto.verifierIds !== undefined) {
      await this.db.deleteFrom('pageVerifiers').where('pageVerificationId', '=', verification.id).execute();
      const rows = dto.verifierIds.map((userId: string) => ({ pageVerificationId: verification.id, userId, addedById: user.id }));
      await this.db.insertInto('pageVerifiers').values(rows).execute();
    }

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_VERIFICATION_UPDATED, resourceType: AuditResource.PAGE,
      resourceId: dto.pageId, spaceId: verification.spaceId,
    }, { workspaceId: verification.workspaceId, actorId: user.id, actorType: 'user' });
  }

  async deleteVerification(pageId: string, user: User, workspace: Workspace) {
    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', pageId).executeTakeFirst();
    if (!verification) throw new NotFoundException('Verification not found');
    await this.assertCanManage(verification.spaceId, user, workspace);

    await this.db.deleteFrom('pageVerifiers').where('pageVerificationId', '=', verification.id).execute();
    await this.db.deleteFrom('pageVerifications').where('id', '=', verification.id).execute();

    // No verification -> not eligible for RAG; re-sync removes any embeddings.
    await this.enqueueRagSync(verification.pageId, verification.workspaceId);

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_VERIFICATION_REMOVED, resourceType: AuditResource.PAGE,
      resourceId: pageId, spaceId: verification.spaceId,
    }, { workspaceId: verification.workspaceId, actorId: user.id, actorType: 'user' });
  }

  async verifyPage(pageId: string, user: User, workspace: Workspace) {
    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', pageId).executeTakeFirst();
    if (!verification) throw new NotFoundException('Verification not found');

    const canVerify = await this.userCanVerify(verification, user, workspace);
    if (!canVerify) throw new ForbiddenException('You are not authorized to verify this page');

    const now = new Date();
    let newStatus: string;
    let newExpiresAt: Date | null = null;

    if (verification.type === 'expiring') {
      newStatus = 'verified';
      newExpiresAt = this.calculateExpiresAt(verification.mode, verification.periodAmount, verification.periodUnit, undefined);
    } else if (verification.type === 'qms' && verification.status === 'in_approval') {
      newStatus = 'approved';
    } else if (verification.type === 'qms' && verification.status === 'approved') {
      newStatus = 'verified';
      newExpiresAt = this.calculateExpiresAt(verification.mode, verification.periodAmount, verification.periodUnit, undefined);
    } else {
      newStatus = 'verified';
    }

    const updateData: any = { status: newStatus, verifiedAt: now, verifiedById: user.id, updatedAt: now };
    if (newExpiresAt) updateData.expiresAt = newExpiresAt;
    await this.db.updateTable('pageVerifications').set(updateData).where('id', '=', verification.id).execute();

    const verifiers = await this.getVerifiers(verification.id);
    const otherIds = verifiers.map((v: any) => v.userId).filter((id: string) => id !== user.id);
    if (otherIds.length > 0) {
      await this.notificationQueue.add(QueueJob.PAGE_VERIFIED_NOTIFICATION, {
        pageId: verification.pageId, spaceId: verification.spaceId, workspaceId: verification.workspaceId,
        actorId: user.id, verifierIds: otherIds,
      });
    }

    // A page only enters RAG once it reaches final 'verified' status (not the
    // intermediate qms 'approved' step).
    if (newStatus === 'verified') {
      await this.enqueueRagSync(verification.pageId, verification.workspaceId);
    }

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_VERIFIED, resourceType: AuditResource.PAGE,
      resourceId: pageId, spaceId: verification.spaceId,
    }, { workspaceId: verification.workspaceId, actorId: user.id, actorType: 'user' });
  }

  async submitForApproval(pageId: string, user: User) {
    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', pageId).executeTakeFirst();
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.type !== 'qms') throw new BadRequestException('This verification is not an approval workflow');
    if (verification.status !== 'draft') throw new BadRequestException('Page is not in draft status');

    await this.db.updateTable('pageVerifications').set({
      status: 'in_approval', requestedAt: new Date(), requestedById: user.id, updatedAt: new Date(),
    }).where('id', '=', verification.id).execute();

    const verifiers = await this.getVerifiers(verification.id);
    const verifierIds = verifiers.map((v: any) => v.userId);
    if (verifierIds.length > 0) {
      await this.notificationQueue.add(QueueJob.PAGE_APPROVAL_REQUESTED_NOTIFICATION, {
        pageId: verification.pageId, spaceId: verification.spaceId, workspaceId: verification.workspaceId,
        actorId: user.id, verifierIds,
      });
    }

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_APPROVAL_REQUESTED, resourceType: AuditResource.PAGE,
      resourceId: pageId, spaceId: verification.spaceId,
    }, { workspaceId: verification.workspaceId, actorId: user.id, actorType: 'user' });
  }

  async rejectApproval(pageId: string, comment: string | undefined, user: User, workspace: Workspace) {
    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', pageId).executeTakeFirst();
    if (!verification) throw new NotFoundException('Verification not found');
    if (verification.type !== 'qms') throw new BadRequestException('This verification is not an approval workflow');
    if (verification.status !== 'in_approval') throw new BadRequestException('Page is not pending approval');
    if (!verification.requestedById) throw new BadRequestException('No approval request found');

    const canReject = await this.userCanVerify(verification, user, workspace);
    if (!canReject) throw new ForbiddenException('You are not authorized to reject this approval');

    await this.db.updateTable('pageVerifications').set({
      status: 'draft', rejectedAt: new Date(), rejectedById: user.id,
      rejectionComment: comment ?? null, requestedAt: null, requestedById: null, updatedAt: new Date(),
    }).where('id', '=', verification.id).execute();

    await this.notificationQueue.add(QueueJob.PAGE_APPROVAL_REJECTED_NOTIFICATION, {
      pageId: verification.pageId, spaceId: verification.spaceId, workspaceId: verification.workspaceId,
      actorId: user.id, requestedById: verification.requestedById, comment,
    });

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_APPROVAL_REJECTED, resourceType: AuditResource.PAGE,
      resourceId: pageId, spaceId: verification.spaceId,
    }, { workspaceId: verification.workspaceId, actorId: user.id, actorType: 'user' });
  }

  async markObsolete(pageId: string, user: User, workspace: Workspace) {
    const verification = await this.db.selectFrom('pageVerifications').selectAll()
      .where('pageId', '=', pageId).executeTakeFirst();
    if (!verification) throw new NotFoundException('Verification not found');
    await this.assertCanManage(verification.spaceId, user, workspace);
    await this.db.updateTable('pageVerifications').set({ status: 'obsolete', updatedAt: new Date() })
      .where('id', '=', verification.id).execute();

    // Obsolete content must leave the knowledge base.
    await this.enqueueRagSync(verification.pageId, verification.workspaceId);

    await this.auditService.logWithContext({
      event: AuditEvent.PAGE_MARKED_OBSOLETE, resourceType: AuditResource.PAGE,
      resourceId: pageId, spaceId: verification.spaceId,
    }, { workspaceId: verification.workspaceId, actorId: user.id, actorType: 'user' });
  }

  async listVerifications(dto: VerificationsListDto, user: User, workspace: Workspace) {
    const wAbility = this.workspaceAbility.createForUser(user, workspace);
    if (wAbility.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException('Workspace admin access required');
    }

    const limit = dto.limit ?? 20;
    let query = this.db.selectFrom('pageVerifications as pv')
      .innerJoin('pages as p', 'p.id', 'pv.pageId')
      .innerJoin('spaces as s', 's.id', 'pv.spaceId')
      .where('pv.workspaceId', '=', workspace.id)
      .select(['pv.id', 'pv.pageId', 'pv.spaceId', 'pv.type', 'pv.status', 'pv.mode',
        'pv.periodAmount', 'pv.periodUnit', 'pv.verifiedAt', 'pv.expiresAt', 'pv.createdAt',
        'p.title as pageTitle', 'p.slugId as pageSlugId', 'p.icon as pageIcon',
        's.name as spaceName', 's.slug as spaceSlug']);

    if (dto.spaceIds && dto.spaceIds.length > 0) query = query.where('pv.spaceId', 'in', dto.spaceIds);
    if (dto.verifierId) query = query.innerJoin('pageVerifiers as ver', 'ver.pageVerificationId', 'pv.id').where('ver.userId', '=', dto.verifierId);
    if (dto.type) query = query.where('pv.type', '=', dto.type);
    if (dto.query) {
      const q = '%' + dto.query + '%';
      query = query.where((eb) => eb.or([eb('p.title', 'ilike', q), eb('s.name', 'ilike', q)]));
    }
    if (dto.beforeCursor) { query = query.where('pv.id', '<', dto.beforeCursor).orderBy('pv.id', 'desc'); }
    else { if (dto.cursor) query = query.where('pv.id', '<', dto.cursor); query = query.orderBy('pv.id', 'desc'); }
    query = query.limit(limit + 1);

    const rows = await query.execute();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const verificationIds = items.map((r) => r.id);

    let verRows: any[] = [];
    if (verificationIds.length > 0) {
      verRows = await this.db.selectFrom('pageVerifiers as pv2')
        .innerJoin('users as u', 'u.id', 'pv2.userId')
        .select(['pv2.pageVerificationId', 'u.id', 'u.name', 'u.avatarUrl'])
        .where('pv2.pageVerificationId', 'in', verificationIds).execute();
    }

    const verMap = new Map<string, any[]>();
    for (const row of verRows) {
      if (!verMap.has(row.pageVerificationId)) verMap.set(row.pageVerificationId, []);
      verMap.get(row.pageVerificationId)!.push({ id: row.id, name: row.name, avatarUrl: row.avatarUrl });
    }

    const result = items.map((item) => ({
      id: item.id, pageId: item.pageId, spaceId: item.spaceId, type: item.type,
      status: this.computeEffectiveStatus({ status: item.status, type: item.type, expiresAt: item.expiresAt }),
      mode: item.mode, periodAmount: item.periodAmount, periodUnit: item.periodUnit,
      verifiedAt: item.verifiedAt ? item.verifiedAt.toISOString() : null,
      expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      pageTitle: getPageTitle(item.pageTitle), pageSlugId: item.pageSlugId, pageIcon: item.pageIcon,
      spaceName: item.spaceName, spaceSlug: item.spaceSlug,
      verifiers: verMap.get(item.id) ?? [],
    }));

    return { items: result, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  private async getPermissions(pageId: string, spaceId: string, verification: any, verifiers: any[], user: User) {
    const wAbility = this.workspaceAbility.createForUser(user, { id: verification?.workspaceId ?? '' } as Workspace);
    const isWorkspaceAdmin = wAbility.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings);
    const sAbility = await this.spaceAbility.createForUser(user, spaceId);
    const isSpaceAdmin = sAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
    const isVerifier = verifiers.some((v: any) => v.userId === user.id);
    const canManage = isSpaceAdmin || isWorkspaceAdmin;
    let canVerify = false;
    let canSubmitForApproval = false;
    if (verification) {
      if (isVerifier || isWorkspaceAdmin) {
        if (verification.type === 'expiring') canVerify = true;
        else if (verification.type === 'qms') canVerify = verification.status === 'in_approval' || verification.status === 'approved';
      }
      if (verification.type === 'qms' && verification.status === 'draft') canSubmitForApproval = true;
    }
    return { canVerify, canManage, canSubmitForApproval, canMarkObsolete: canManage };
  }

  private async assertCanManage(spaceId: string, user: User, workspace: Workspace) {
    const wAbility = this.workspaceAbility.createForUser(user, workspace);
    if (wAbility.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) return;
    const sAbility = await this.spaceAbility.createForUser(user, spaceId);
    if (sAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) return;
    throw new ForbiddenException('You are not authorized to manage verifications');
  }

  private async userCanVerify(verification: any, user: User, workspace: Workspace): Promise<boolean> {
    const wAbility = this.workspaceAbility.createForUser(user, workspace);
    if (wAbility.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)) return true;
    const row = await this.db.selectFrom('pageVerifiers').select('userId')
      .where('pageVerificationId', '=', verification.id).where('userId', '=', user.id).executeTakeFirst();
    return !!row;
  }

  private async getVerifiers(verificationId: string): Promise<any[]> {
    return this.db.selectFrom('pageVerifiers as pv')
      .innerJoin('users as u', 'u.id', 'pv.userId')
      .select(['pv.id', 'pv.userId', 'u.name', 'u.avatarUrl', 'u.email'])
      .where('pv.pageVerificationId', '=', verificationId).execute();
  }

  private async getUserRef(userId: string) {
    const u = await this.db.selectFrom('users').select(['id', 'name', 'avatarUrl']).where('id', '=', userId).executeTakeFirst();
    return u ? { id: u.id, name: u.name, avatarUrl: u.avatarUrl } : null;
  }

  private calculateExpiresAt(mode: string | null, periodAmount: number | null, periodUnit: string | null, fixedExpiresAt: string | undefined): Date | null {
    if (mode === 'indefinite') return null;
    if (mode === 'fixed' && fixedExpiresAt) return new Date(fixedExpiresAt);
    if (mode === 'period' && periodAmount && periodUnit) {
      const now = new Date();
      switch (periodUnit) {
        case 'day': return new Date(now.getTime() + periodAmount * 24 * 60 * 60 * 1000);
        case 'week': return new Date(now.getTime() + periodAmount * 7 * 24 * 60 * 60 * 1000);
        case 'month': return new Date(now.setMonth(now.getMonth() + periodAmount));
        case 'year': return new Date(now.setFullYear(now.getFullYear() + periodAmount));
      }
    }
    return null;
  }

  private computeEffectiveStatus(v: { status: string | null; type: string; expiresAt: Date | null }): string {
    if (!v.status) return 'none';
    if (v.status === 'obsolete') return 'obsolete';
    if (v.type === 'expiring' && v.status === 'verified' && v.expiresAt) {
      const now = Date.now();
      const expiresMs = new Date(v.expiresAt).getTime();
      if (expiresMs <= now) return 'expired';
      if (expiresMs - now <= EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000) return 'expiring';
    }
    return v.status;
  }

  private async scheduleReconcile() {
    try { await this.notificationQueue.add(QueueJob.VERIFICATION_RECONCILE, {}); }
    catch (err) { this.logger.error('Failed to schedule verification reconcile', err); }
  }
}
