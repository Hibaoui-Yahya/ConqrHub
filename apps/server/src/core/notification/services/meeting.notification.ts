import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../notification.constants';

/** Pipeline statuses after which the person who recorded can act. */
const READY_STATUSES = new Set(['awaiting_review']);
const FAILED_STATUSES = new Set(['failed', 'partially_failed']);
const REVIEW_STATUSES = new Set(['speakers_pending_review']);

/**
 * Suite notifications for the ConqrMeet pipeline. The meeting owner is told
 * when a recording is ready, when processing failed and when the speakers
 * need confirming; publishing a report is announced too. These land in the
 * same notification list as page and comment notifications, so ConqrHub and
 * ConqrMeet show one bell.
 */
@Injectable()
export class MeetingNotificationService {
  private readonly logger = new Logger(MeetingNotificationService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
  ) {}

  /** Called on every pipeline transition; picks the ones worth telling. */
  async onTransition(
    meetingId: string,
    fromStatus: string | null,
    toStatus: string,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    if (fromStatus === toStatus) return;
    let type: string | null = null;
    if (READY_STATUSES.has(toStatus)) type = NotificationType.MEETING_READY;
    else if (FAILED_STATUSES.has(toStatus))
      type = NotificationType.MEETING_FAILED;
    else if (REVIEW_STATUSES.has(toStatus))
      type = NotificationType.MEETING_REVIEW_NEEDED;
    if (!type) return;
    await this.notify(meetingId, type, {
      status: toStatus,
      reason:
        typeof detail?.error === 'string'
          ? String(detail.error).slice(0, 300)
          : undefined,
    });
  }

  async onPublished(meetingId: string, pageId: string | null, spaceId: string | null) {
    await this.notify(meetingId, NotificationType.MEETING_PUBLISHED, {}, { pageId, spaceId });
  }

  private async notify(
    meetingId: string,
    type: string,
    extra: Record<string, unknown>,
    target: { pageId?: string | null; spaceId?: string | null } = {},
  ) {
    try {
      const meeting = await this.db
        .selectFrom('meetings')
        .select(['id', 'title', 'userId', 'workspaceId', 'failureReason'])
        .where('id', '=', meetingId)
        .executeTakeFirst();
      if (!meeting?.userId) return;
      await this.notificationService.create({
        userId: meeting.userId,
        workspaceId: meeting.workspaceId,
        type,
        actorId: null,
        pageId: target.pageId ?? null,
        spaceId: target.spaceId ?? null,
        data: JSON.stringify({
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          ...(type === NotificationType.MEETING_FAILED
            ? { reason: extra.reason ?? meeting.failureReason ?? null }
            : {}),
          ...extra,
        }) as any,
      });
    } catch (error) {
      // A notification must never break the meeting pipeline.
      this.logger.warn(
        `Meeting notification ${type} for ${meetingId} failed: ${(error as Error).message}`,
      );
    }
  }
}
