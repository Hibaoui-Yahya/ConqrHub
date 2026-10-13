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
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import {
  BulkVerifyDto,
  CreateVerificationDto,
  UnverifiedPagesDto,
  UpdateVerificationDto,
  VerificationInfoDto,
  VerificationOverviewDto,
  VerificationsListDto,
} from './dto/page-verification.dto';

const EXPIRING_WINDOW_DAYS = 7;
const MAX_VERIFIERS = 5;
const UNVERIFIED_DEFAULT_LIMIT = 50;

/** Effective verification states as counted by the overview endpoint. */
type EffectiveStatus =
  | 'verified'
  | 'expiring'
  | 'expired'
  | 'draft'
  | 'in_approval'
  | 'approved'
  | 'obsolete'
  | 'none';

export interface VerificationOverview {
  verified: number;
  expiring: number;
  expired: number;
  draft: number;
  inApproval: number;
  approved: number;
  obsolete: number;
  none: number;
  total: number;
  /** Pages NOT effectively verified (= not in rag_retrieve). */
  unverified: number;
  spaces: Array<{
    spaceId: string;
    spaceName: string | null;
    spaceSlug: string | null;
    total: number;
    verified: number;
    unverified: number;
  }>;
  /** max(ai_embeddings.updated_at) for the workspace, null when nothing is indexed. */
  lastIndexedAt: string | null;
}

export interface UnverifiedPageItem {
  id: string;
  title: string | null;
  slugId: string;
  icon: string | null;
  spaceId: string;
  spaceName: string | null;
  spaceSlug: string | null;
  status: EffectiveStatus;
  updatedAt: string;
  lastVerifiedAt: string | null;
  updatedByName?: string;
}

export interface BulkVerifyResult {
  verified: string[];
  failed: Array<{ pageId: string; reason: string }>;
}

/**
 * Keyset cursor for the unverified listing: `<updatedAt ISO>|<page id>`,
 * base64url-encoded so it is opaque to the client.
 */
function encodeUnverifiedCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`, 'utf8').toString(
    'base64url',
  );
}

function decodeUnverifiedCursor(
  cursor: string | undefined,
): { updatedAt: Date; id: string } | null {
  if (!cursor) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  const sep = decoded.indexOf('|');
  if (sep <= 0) throw new BadRequestException('Invalid cursor');
  const updatedAt = new Date(decoded.slice(0, sep));
  const id = decoded.slice(sep + 1);
  if (Number.isNaN(updatedAt.getTime()) || !id) {
    throw new BadRequestException('Invalid cursor');
  }
  return { updatedAt, id };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => '\\' + m);
}

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
    private readonly spaceMemberRepo: SpaceMemberRepo,
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
      .returning(['pageId', 'spaceId', 'workspaceId', 'id'])
      .execute();

    // The page just left the knowledge base without anyone being told: let
    // the verifiers know so it gets re-verified (in-app notification).
    for (const row of affected) {
      try {
        await this.notificationQueue.add(
          QueueJob.PAGE_VERIFICATION_INVALIDATED,
          {
            pageId: row.pageId,
            spaceId: row.spaceId,
            workspaceId: row.workspaceId,
            verificationId: row.id,
          },
        );
      } catch (err) {
        this.logger.error(
          `Failed to enqueue verification-invalidated notice for page ${row.pageId}`,
          err,
        );
      }
    }

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

  /**
   * Pages that are NOT effectively verified — i.e. invisible to RAG /
   * rag_retrieve / Ask HR. A page counts as verified only when its
   * verification row has status 'verified' or 'expiring' AND has no past
   * expiry (mirrors isEffectivelyVerified in embedding-indexer.service.ts).
   * Scoped to the caller's accessible spaces; spaceIds === [] => [].
   */
  async listUnverifiedPages(
    workspaceId: string,
    spaceIds: string[] | undefined,
    limit: number,
  ): Promise<
    Array<{ id: string; title: string | null; spaceId: string; status: string }>
  > {
    if (spaceIds && spaceIds.length === 0) return [];

    const now = new Date();
    const rows = await (this.db as any)
      .selectFrom('pages as p')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
      .select([
        'p.id as id',
        'p.title as title',
        'p.spaceId as spaceId',
        'pv.status as verificationStatus',
      ])
      .where('p.workspaceId', '=', workspaceId)
      .where('p.deletedAt', 'is', null)
      .$if(!!spaceIds, (qb: any) => qb.where('p.spaceId', 'in', spaceIds))
      .where((eb: any) =>
        eb.or([
          eb('pv.status', 'is', null),
          eb('pv.status', 'not in', ['verified', 'expiring']),
          eb.and([
            eb('pv.expiresAt', 'is not', null),
            eb('pv.expiresAt', '<=', now),
          ]),
        ]),
      )
      .orderBy('p.updatedAt', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title ?? null,
      spaceId: r.spaceId,
      status: r.verificationStatus ?? 'none',
    }));
  }

  /**
   * Verification coverage of the pages the caller can see (all accessible
   * spaces, or one space after a Read check). Counts use the same effective
   * status as the RAG gate; `unverified` = pages invisible to rag_retrieve.
   */
  async getVerificationOverview(
    dto: VerificationOverviewDto,
    user: User,
    workspace: Workspace,
  ): Promise<VerificationOverview> {
    const spaceIds = await this.resolveScopedSpaceIds(user, dto.spaceId);
    const overview: VerificationOverview = {
      verified: 0, expiring: 0, expired: 0, draft: 0, inApproval: 0,
      approved: 0, obsolete: 0, none: 0, total: 0, unverified: 0,
      spaces: [], lastIndexedAt: null,
    };
    if (spaceIds.length === 0) return overview;

    const rows: Array<{
      spaceId: string;
      status: string | null;
      expiresAt: Date | null;
    }> = await (this.db as any)
      .selectFrom('pages as p')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
      .select(['p.spaceId as spaceId', 'pv.status as status', 'pv.expiresAt as expiresAt'])
      .where('p.workspaceId', '=', workspace.id)
      .where('p.deletedAt', 'is', null)
      .where('p.spaceId', 'in', spaceIds)
      .execute();

    const spaceRows: Array<{ id: string; name: string | null; slug: string | null }> =
      await (this.db as any)
        .selectFrom('spaces')
        .select(['id', 'name', 'slug'])
        .where('id', 'in', spaceIds)
        .where('workspaceId', '=', workspace.id)
        .execute();

    const perSpace = new Map<string, { total: number; verified: number }>();
    for (const id of spaceIds) perSpace.set(id, { total: 0, verified: 0 });

    const now = Date.now();
    for (const r of rows) {
      const status = this.effectiveStatusForGate(r.status, r.expiresAt, now);
      overview.total += 1;
      switch (status) {
        case 'verified': overview.verified += 1; break;
        case 'expiring': overview.expiring += 1; break;
        case 'expired': overview.expired += 1; break;
        case 'draft': overview.draft += 1; break;
        case 'in_approval': overview.inApproval += 1; break;
        case 'approved': overview.approved += 1; break;
        case 'obsolete': overview.obsolete += 1; break;
        default: overview.none += 1;
      }
      const isVerified = status === 'verified' || status === 'expiring';
      if (!isVerified) overview.unverified += 1;
      const bucket = perSpace.get(r.spaceId) ?? { total: 0, verified: 0 };
      bucket.total += 1;
      if (isVerified) bucket.verified += 1;
      perSpace.set(r.spaceId, bucket);
    }

    const spaceMeta = new Map(spaceRows.map((s) => [s.id, s]));
    overview.spaces = [...perSpace.entries()]
      .map(([spaceId, b]) => ({
        spaceId,
        spaceName: spaceMeta.get(spaceId)?.name ?? null,
        spaceSlug: spaceMeta.get(spaceId)?.slug ?? null,
        total: b.total,
        verified: b.verified,
        unverified: b.total - b.verified,
      }))
      .sort((a, b) => b.unverified - a.unverified || b.total - a.total);

    try {
      const idx: { max: Date | string | null } | undefined = await (this.db as any)
        .selectFrom('aiEmbeddings')
        .select((eb: any) => eb.fn.max('updatedAt').as('max'))
        .where('workspaceId', '=', workspace.id)
        .executeTakeFirst();
      overview.lastIndexedAt = idx?.max ? new Date(idx.max).toISOString() : null;
    } catch (err) {
      this.logger.warn(`lastIndexedAt lookup failed: ${(err as Error)?.message}`);
    }

    return overview;
  }

  /**
   * Paged, filterable variant of listUnverifiedPages for the UI. Same
   * predicate (not effectively verified), scoped to accessible spaces,
   * ordered by updatedAt desc with a keyset cursor on (updatedAt, id).
   */
  async listUnverifiedPagesPaged(
    dto: UnverifiedPagesDto,
    user: User,
    workspace: Workspace,
  ): Promise<{ items: UnverifiedPageItem[]; nextCursor: string | null }> {
    const spaceIds = await this.resolveScopedSpaceIds(user, dto.spaceId);
    if (spaceIds.length === 0) return { items: [], nextCursor: null };

    const limit = dto.limit ?? UNVERIFIED_DEFAULT_LIMIT;
    const cursor = decodeUnverifiedCursor(dto.cursor);
    const now = new Date();

    let query = (this.db as any)
      .selectFrom('pages as p')
      .innerJoin('spaces as s', 's.id', 'p.spaceId')
      .leftJoin('pageVerifications as pv', 'pv.pageId', 'p.id')
      .leftJoin('users as u', 'u.id', 'p.lastUpdatedById')
      .select([
        'p.id as id',
        'p.title as title',
        'p.slugId as slugId',
        'p.icon as icon',
        'p.spaceId as spaceId',
        'p.updatedAt as updatedAt',
        's.name as spaceName',
        's.slug as spaceSlug',
        'pv.status as verificationStatus',
        'pv.expiresAt as expiresAt',
        'pv.verifiedAt as verifiedAt',
        'u.name as updatedByName',
      ])
      .where('p.workspaceId', '=', workspace.id)
      .where('p.deletedAt', 'is', null)
      .where('p.spaceId', 'in', spaceIds)
      .where((eb: any) =>
        eb.or([
          eb('pv.status', 'is', null),
          eb('pv.status', 'not in', ['verified', 'expiring']),
          eb.and([
            eb('pv.expiresAt', 'is not', null),
            eb('pv.expiresAt', '<=', now),
          ]),
        ]),
      );

    const q = dto.query?.trim();
    if (q) {
      query = query.where('p.title', 'ilike', `%${escapeLike(q)}%`);
    }
    if (cursor) {
      query = query.where((eb: any) =>
        eb.or([
          eb('p.updatedAt', '<', cursor.updatedAt),
          eb.and([
            eb('p.updatedAt', '=', cursor.updatedAt),
            eb('p.id', '<', cursor.id),
          ]),
        ]),
      );
    }

    const rows: any[] = await query
      .orderBy('p.updatedAt', 'desc')
      .orderBy('p.id', 'desc')
      .limit(limit + 1)
      .execute();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nowMs = now.getTime();

    const items: UnverifiedPageItem[] = page.map((r) => ({
      id: r.id,
      title: r.title ?? null,
      slugId: r.slugId,
      icon: r.icon ?? null,
      spaceId: r.spaceId,
      spaceName: r.spaceName ?? null,
      spaceSlug: r.spaceSlug ?? null,
      status: this.effectiveStatusForGate(r.verificationStatus, r.expiresAt, nowMs),
      updatedAt: new Date(r.updatedAt).toISOString(),
      lastVerifiedAt: r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null,
      ...(r.updatedByName ? { updatedByName: r.updatedByName } : {}),
    }));

    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last ? encodeUnverifiedCursor(new Date(last.updatedAt), last.id) : null,
    };
  }

  /**
   * Verify many pages in one call. Per page: must exist in the workspace;
   * the caller needs manage rights on its space (workspace admin or space
   * admin) to create a missing verification, or must already be one of its
   * verifiers. A space admin who is not yet a verifier is added as one so
   * verifyPage's own check passes. One bad page never aborts the batch.
   */
  async bulkVerify(
    dto: BulkVerifyDto,
    user: User,
    workspace: Workspace,
  ): Promise<BulkVerifyResult> {
    const result: BulkVerifyResult = { verified: [], failed: [] };
    const pageIds = [...new Set(dto.pageIds)];
    const isWorkspaceAdmin = this.isWorkspaceAdmin(user, workspace);

    for (const pageId of pageIds) {
      try {
        const page = await this.db
          .selectFrom('pages')
          .select(['id', 'spaceId', 'workspaceId'])
          .where('id', '=', pageId)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();
        if (!page || page.workspaceId !== workspace.id) {
          result.failed.push({ pageId, reason: 'not_found' });
          continue;
        }

        const canManage =
          isWorkspaceAdmin || (await this.isSpaceAdmin(page.spaceId, user));
        const existing = await this.db
          .selectFrom('pageVerifications')
          .select(['id', 'status'])
          .where('pageId', '=', pageId)
          .executeTakeFirst();

        if (!existing) {
          if (!canManage) {
            result.failed.push({ pageId, reason: 'forbidden' });
            continue;
          }
          await this.createVerification(
            {
              pageId,
              type: 'expiring',
              verifierIds: [user.id],
              ...(dto.expiresInDays
                ? { mode: 'period', periodAmount: dto.expiresInDays, periodUnit: 'day' }
                : { mode: 'indefinite' }),
            } as CreateVerificationDto,
            user,
            workspace,
          );
        } else {
          const verifierRows = await this.db
            .selectFrom('pageVerifiers')
            .select('userId')
            .where('pageVerificationId', '=', existing.id)
            .execute();
          const isVerifier = verifierRows.some((v) => v.userId === user.id);
          if (!isVerifier && !canManage) {
            result.failed.push({ pageId, reason: 'forbidden' });
            continue;
          }
          if (!isVerifier && !isWorkspaceAdmin) {
            // Space admin: join the verifier list so verifyPage accepts them.
            if (verifierRows.length >= MAX_VERIFIERS) {
              result.failed.push({ pageId, reason: 'verifier_limit' });
              continue;
            }
            await this.db
              .insertInto('pageVerifiers')
              .values({ pageVerificationId: existing.id, userId: user.id, addedById: user.id })
              .execute();
          }
        }

        await this.verifyPage(pageId, user, workspace);
        result.verified.push(pageId);
      } catch (err) {
        const reason =
          err instanceof ForbiddenException
            ? 'forbidden'
            : err instanceof NotFoundException
              ? 'not_found'
              : err instanceof BadRequestException
                ? 'invalid_state'
                : 'error';
        this.logger.warn(
          `bulkVerify: page ${pageId} failed (${reason}): ${(err as Error)?.message}`,
        );
        result.failed.push({ pageId, reason });
      }
    }

    return result;
  }

  /**
   * Spaces the caller may read: the one requested (after a Read check) or
   * every space they are a member of.
   */
  private async resolveScopedSpaceIds(
    user: User,
    spaceId: string | undefined,
  ): Promise<string[]> {
    if (!spaceId) return this.spaceMemberRepo.getUserSpaceIds(user.id);
    let ability;
    try {
      ability = await this.spaceAbility.createForUser(user, spaceId);
    } catch {
      throw new ForbiddenException('You do not have access to this space');
    }
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException('You do not have access to this space');
    }
    return [spaceId];
  }

  /**
   * Effective status as the RAG gate sees it (isEffectivelyVerified in
   * embedding-indexer.service.ts): verified/expiring rows past expiry are
   * 'expired'; within EXPIRING_WINDOW_DAYS they are 'expiring'.
   */
  private effectiveStatusForGate(
    status: string | null | undefined,
    expiresAt: Date | string | null | undefined,
    nowMs: number,
  ): EffectiveStatus {
    if (!status) return 'none';
    if (status === 'verified' || status === 'expiring') {
      if (expiresAt) {
        const expiresMs = new Date(expiresAt).getTime();
        if (expiresMs <= nowMs) return 'expired';
        if (expiresMs - nowMs <= EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000) return 'expiring';
      }
      return 'verified';
    }
    if (status === 'draft' || status === 'in_approval' || status === 'approved' || status === 'obsolete') {
      return status;
    }
    return 'draft';
  }

  private isWorkspaceAdmin(user: User, workspace: Workspace): boolean {
    const wAbility = this.workspaceAbility.createForUser(user, workspace);
    return wAbility.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings);
  }

  private async isSpaceAdmin(spaceId: string, user: User): Promise<boolean> {
    try {
      const sAbility = await this.spaceAbility.createForUser(user, spaceId);
      return sAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
    } catch {
      return false;
    }
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
