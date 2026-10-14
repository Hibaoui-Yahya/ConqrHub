import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import {
  IApprovalRejectedNotificationJob,
  IApprovalRequestedNotificationJob,
  IPageVerifiedNotificationJob,
  IVerificationExpiringNotificationJob,
  IVerificationExpiredNotificationJob,
} from '../../../integrations/queue/constants/queue.interface';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../notification.constants';
import { VerificationExpiringEmail } from '@docmost/transactional/emails/verification-expiring-email';
import { VerificationExpiredEmail } from '@docmost/transactional/emails/verification-expired-email';
import { ApprovalRequestedEmail } from '@docmost/transactional/emails/approval-requested-email';
import { ApprovalRejectedEmail } from '@docmost/transactional/emails/approval-rejected-email';
import { ApprovalApprovedEmail } from '@docmost/transactional/emails/approval-approved-email';
import { formatDateFr } from '@docmost/transactional/partials/partials';
import { getPageTitle } from '../../../common/helpers';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';

/**
 * Payload of QueueJob.PAGE_VERIFICATION_INVALIDATED, enqueued by
 * PageVerificationService.invalidateOnContentChange when a content save
 * resets a valid verification to draft (and drops the page from RAG).
 */
export interface IVerificationInvalidatedNotificationJob {
  pageId: string;
  spaceId: string;
  workspaceId: string;
  verificationId: string;
}

@Injectable()
export class VerificationNotificationService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  private async getAlreadyNotifiedUserIds(
    pageVerificationId: string,
    type: string,
  ): Promise<Set<string>> {
    const rows = await this.db
      .selectFrom('notifications')
      .select('userId')
      .where('pageVerificationId', '=', pageVerificationId)
      .where('type', '=', type)
      .execute();
    return new Set(rows.map((r) => r.userId));
  }

  private async filterAccessibleRecipients(
    userIds: string[],
    pageId: string,
    spaceId: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];
    const inSpace = await this.spaceMemberRepo.getUserIdsWithSpaceAccess(
      userIds,
      spaceId,
    );
    if (inSpace.size === 0) return [];
    return this.pagePermissionRepo.getUserIdsWithPageAccess(pageId, [
      ...inSpace,
    ]);
  }

  async processVerificationExpiring(
    data: IVerificationExpiringNotificationJob,
    appUrl: string,
  ) {
    const verification = await this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('id', '=', data.verificationId)
      .executeTakeFirst();

    if (!verification) return;
    if (verification.type !== 'expiring') return;
    if (!verification.expiresAt) return;
    const expiresAtMs = new Date(verification.expiresAt).getTime();
    if (expiresAtMs <= Date.now()) return;

    const verifierRows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verification.id)
      .execute();
    const verifierIds = verifierRows.map((r) => r.userId);
    if (verifierIds.length === 0) return;

    const accessibleVerifierIds = await this.filterAccessibleRecipients(
      verifierIds,
      verification.pageId,
      verification.spaceId,
    );
    if (accessibleVerifierIds.length === 0) return;

    const alreadyNotified = await this.getAlreadyNotifiedUserIds(
      verification.id,
      NotificationType.PAGE_VERIFICATION_EXPIRING,
    );
    const recipients = accessibleVerifierIds.filter(
      (id) => !alreadyNotified.has(id),
    );
    if (recipients.length === 0) return;

    const context = await this.getPageContext(
      verification.pageId,
      verification.spaceId,
      appUrl,
    );
    if (!context) return;

    const { pageTitle, spaceName, basePageUrl } = context;
    const expiresAtIso = new Date(verification.expiresAt).toISOString();

    for (const userId of recipients) {
      const notification = await this.notificationService.create({
        userId,
        workspaceId: verification.workspaceId,
        type: NotificationType.PAGE_VERIFICATION_EXPIRING,
        pageId: verification.pageId,
        spaceId: verification.spaceId,
        pageVerificationId: verification.id,
        data: { expiresAt: expiresAtIso },
      });

      const subject = `La vérification de « ${pageTitle} » arrive à échéance`;

      await this.notificationService.queueEmail(
        userId,
        notification.id,
        subject,
        VerificationExpiringEmail({
          pageTitle,
          spaceName,
          pageUrl: basePageUrl,
          expiresAt: formatDateFr(verification.expiresAt).split(' à ')[0],
        }),
      );
    }
  }

  async processVerificationExpired(
    data: IVerificationExpiredNotificationJob,
    appUrl: string,
  ) {
    const verification = await this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('id', '=', data.verificationId)
      .executeTakeFirst();

    if (!verification) return;
    if (verification.type !== 'expiring') return;
    if (!verification.expiresAt) return;
    if (new Date(verification.expiresAt).getTime() > Date.now()) return;

    const verifierRows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verification.id)
      .execute();
    const verifierIds = verifierRows.map((r) => r.userId);
    if (verifierIds.length === 0) return;

    const accessibleVerifierIds = await this.filterAccessibleRecipients(
      verifierIds,
      verification.pageId,
      verification.spaceId,
    );
    if (accessibleVerifierIds.length === 0) return;

    const alreadyNotified = await this.getAlreadyNotifiedUserIds(
      verification.id,
      NotificationType.PAGE_VERIFICATION_EXPIRED,
    );
    const recipients = accessibleVerifierIds.filter(
      (id) => !alreadyNotified.has(id),
    );
    if (recipients.length === 0) return;

    const context = await this.getPageContext(
      verification.pageId,
      verification.spaceId,
      appUrl,
    );
    if (!context) return;

    const { pageTitle, spaceName, basePageUrl } = context;

    for (const userId of recipients) {
      const notification = await this.notificationService.create({
        userId,
        workspaceId: verification.workspaceId,
        type: NotificationType.PAGE_VERIFICATION_EXPIRED,
        pageId: verification.pageId,
        spaceId: verification.spaceId,
        pageVerificationId: verification.id,
      });

      const subject = `La vérification de « ${pageTitle} » a expiré`;

      await this.notificationService.queueEmail(
        userId,
        notification.id,
        subject,
        VerificationExpiredEmail({
          pageTitle,
          spaceName,
          pageUrl: basePageUrl,
        }),
      );
    }
  }

  /**
   * A content save reset a valid verification to draft: the page silently
   * left the knowledge base. Tell its verifiers (in-app only; no email
   * template exists for this yet) so someone re-verifies it. The editor is
   * skipped when they are a verifier themselves, and each verifier is told
   * once per verification cycle (no repeat for every subsequent save until
   * the page is verified again).
   */
  async processVerificationInvalidated(
    data: IVerificationInvalidatedNotificationJob,
  ) {
    const verification = await this.db
      .selectFrom('pageVerifications')
      .selectAll()
      .where('id', '=', data.verificationId)
      .executeTakeFirst();

    if (!verification) return;
    // Re-verified or obsoleted between enqueue and processing: stale job.
    if (verification.status !== 'draft') return;

    const verifierRows = await this.db
      .selectFrom('pageVerifiers')
      .select('userId')
      .where('pageVerificationId', '=', verification.id)
      .execute();
    const verifierIds = verifierRows.map((r) => r.userId);
    if (verifierIds.length === 0) return;

    const page = await this.db
      .selectFrom('pages')
      .select(['lastUpdatedById'])
      .where('id', '=', verification.pageId)
      .executeTakeFirst();
    const actorId = page?.lastUpdatedById ?? null;

    const candidates = verifierIds.filter((id) => id !== actorId);
    if (candidates.length === 0) return;

    const accessible = await this.filterAccessibleRecipients(
      candidates,
      verification.pageId,
      verification.spaceId,
    );
    if (accessible.length === 0) return;

    // One notice per verification cycle: anything created after the last
    // successful verify belongs to the current draft period.
    let dedupe = this.db
      .selectFrom('notifications')
      .select('userId')
      .where('pageVerificationId', '=', verification.id)
      .where('type', '=', NotificationType.PAGE_VERIFICATION_INVALIDATED);
    if (verification.verifiedAt) {
      dedupe = dedupe.where('createdAt', '>', verification.verifiedAt);
    }
    const alreadyNotified = new Set(
      (await dedupe.execute()).map((r) => r.userId),
    );
    const recipients = accessible.filter((id) => !alreadyNotified.has(id));
    if (recipients.length === 0) return;

    const invalidatedAt = new Date().toISOString();
    for (const userId of recipients) {
      await this.notificationService.create({
        userId,
        workspaceId: verification.workspaceId,
        type: NotificationType.PAGE_VERIFICATION_INVALIDATED,
        actorId,
        pageId: verification.pageId,
        spaceId: verification.spaceId,
        pageVerificationId: verification.id,
        data: { invalidatedAt },
      });
    }
  }

  async processPageVerified(data: IPageVerifiedNotificationJob, appUrl?: string) {
    const { verifierIds, pageId, spaceId, workspaceId, actorId, approvedRequesterId } =
      data;

    const accessibleVerifierIds = verifierIds.length
      ? await this.filterAccessibleRecipients(verifierIds, pageId, spaceId)
      : [];

    for (const userId of accessibleVerifierIds) {
      await this.notificationService.create({
        userId,
        workspaceId,
        type: NotificationType.PAGE_VERIFIED,
        actorId,
        pageId,
        spaceId,
      });
    }

    if (!approvedRequesterId || accessibleVerifierIds.includes(approvedRequesterId)) {
      return;
    }
    const [requester] = await this.filterAccessibleRecipients(
      [approvedRequesterId],
      pageId,
      spaceId,
    );
    if (!requester || !appUrl) return;

    const context = await this.getPageContext(pageId, spaceId, appUrl);
    if (!context) return;
    const { pageTitle, spaceName, basePageUrl } = context;

    const notification = await this.notificationService.create({
      userId: requester,
      workspaceId,
      type: NotificationType.PAGE_VERIFIED,
      actorId,
      pageId,
      spaceId,
    });
    if (!notification) return;

    await this.notificationService.queueEmail(
      requester,
      notification.id,
      `« ${pageTitle} » est approuvée`,
      ApprovalApprovedEmail({
        userName: await this.getUserName(requester),
        actorName: await this.getUserName(actorId),
        pageTitle,
        spaceName,
        pageUrl: basePageUrl,
      }),
    );
  }

  async processApprovalRequested(
    data: IApprovalRequestedNotificationJob,
    appUrl: string,
  ) {
    const { verifierIds, pageId, spaceId, workspaceId, actorId } = data;
    if (verifierIds.length === 0) return;

    const accessibleVerifierIds = await this.filterAccessibleRecipients(
      verifierIds,
      pageId,
      spaceId,
    );
    if (accessibleVerifierIds.length === 0) return;

    const context = await this.getPageContext(pageId, spaceId, appUrl);
    if (!context) return;

    const { pageTitle, spaceName, basePageUrl } = context;
    const actorName = await this.getUserName(actorId);

    for (const userId of accessibleVerifierIds) {
      const notification = await this.notificationService.create({
        userId,
        workspaceId,
        type: NotificationType.PAGE_APPROVAL_REQUESTED,
        actorId,
        pageId,
        spaceId,
      });

      const subject = `Approbation demandée : « ${pageTitle} »`;

      await this.notificationService.queueEmail(
        userId,
        notification.id,
        subject,
        ApprovalRequestedEmail({
          actorName,
          pageTitle,
          spaceName,
          pageUrl: basePageUrl,
        }),
      );
    }
  }

  async processApprovalRejected(
    data: IApprovalRejectedNotificationJob,
    appUrl: string,
  ) {
    const { pageId, spaceId, workspaceId, actorId, requestedById, comment } =
      data;

    const recipients = await this.filterAccessibleRecipients(
      [requestedById],
      pageId,
      spaceId,
    );
    if (recipients.length === 0) return;

    const context = await this.getPageContext(pageId, spaceId, appUrl);
    if (!context) return;

    const { pageTitle, spaceName, basePageUrl } = context;
    const actorName = await this.getUserName(actorId);

    const notification = await this.notificationService.create({
      userId: requestedById,
      workspaceId,
      type: NotificationType.PAGE_APPROVAL_REJECTED,
      actorId,
      pageId,
      spaceId,
    });

    const subject = `Modifications demandées sur « ${pageTitle} »`;

    await this.notificationService.queueEmail(
      requestedById,
      notification.id,
      subject,
      ApprovalRejectedEmail({
        actorName,
        pageTitle,
        spaceName,
        pageUrl: basePageUrl,
        comment,
      }),
    );
  }

  private async getUserName(userId: string): Promise<string> {
    const user = await this.db
      .selectFrom('users')
      .select('name')
      .where('id', '=', userId)
      .executeTakeFirst();
    return user?.name ?? 'Un membre';
  }

  private async getPageContext(
    pageId: string,
    spaceId: string,
    appUrl: string,
  ) {
    const [page, space] = await Promise.all([
      this.db
        .selectFrom('pages')
        .select(['id', 'title', 'slugId'])
        .where('id', '=', pageId)
        .executeTakeFirst(),
      this.db
        .selectFrom('spaces')
        .select(['id', 'slug', 'name'])
        .where('id', '=', spaceId)
        .executeTakeFirst(),
    ]);

    if (!page || !space) return null;

    const basePageUrl = `${appUrl}/s/${space.slug}/p/${page.slugId}`;
    return { pageTitle: getPageTitle(page.title), spaceName: space.name ?? space.slug, basePageUrl };
  }
}
