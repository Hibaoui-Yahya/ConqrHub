import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../notification.constants';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { MeetingReadyEmail } from '@docmost/transactional/emails/meeting-ready-email';
import { MeetingFailedEmail } from '@docmost/transactional/emails/meeting-failed-email';
import { formatDateFr } from '@docmost/transactional/partials/partials';

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
    @Optional() private readonly environmentService?: EnvironmentService,
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
      const notification = await this.notificationService.create({
        userId: meeting.userId,
        workspaceId: meeting.workspaceId,
        type,
        actorId: null,
        pageId: target.pageId ?? null,
        spaceId: target.spaceId ?? null,
        // an object: the jsonb column must hold a JSON object, not a string
        data: {
          meetingId: meeting.id,
          meetingTitle: meeting.title,
          ...extra,
          // after extra: an absent error falls back to the stored reason
          ...(type === NotificationType.MEETING_FAILED
            ? { reason: extra.reason ?? meeting.failureReason ?? null }
            : {}),
        } as any,
      });
      if (
        notification &&
        (type === NotificationType.MEETING_READY ||
          type === NotificationType.MEETING_FAILED)
      ) {
        await this.email(meeting.id, notification.id, extra.status as string);
      }
    } catch (error) {
      // A notification must never break the meeting pipeline.
      this.logger.warn(
        `Meeting notification ${type} for ${meetingId} failed: ${(error as Error).message}`,
      );
    }
  }

  /** Link to the meeting in ConqrMeet, or to Hub when Meet is not deployed. */
  private meetingUrl(meetingId: string): string {
    const meet = this.environmentService?.getMeetAppUrl() ?? '';
    if (meet) return `${meet}/meetings/${meetingId}`;
    return this.environmentService?.getAppUrl() ?? '';
  }

  /**
   * E-mail for a finished recording: "ready" (with the action proposals
   * waiting for a decision), "transcript only" when the report step failed,
   * or "failed".
   */
  private async email(meetingId: string, notificationId: string, status: string) {
    const meeting = await this.db
      .selectFrom('meetings')
      .innerJoin('users', 'users.id', 'meetings.userId')
      .select([
        'meetings.id',
        'meetings.title',
        'meetings.userId',
        'meetings.startedAt',
        'meetings.durationMs',
        'meetings.failureReason',
        'users.name as userName',
      ])
      .where('meetings.id', '=', meetingId)
      .executeTakeFirst();
    if (!meeting) return;

    const meetingUrl = this.meetingUrl(meeting.id);
    if (!meetingUrl) return;
    const title = meeting.title || 'Réunion sans titre';
    const startedAt = meeting.startedAt ? formatDateFr(meeting.startedAt) : undefined;
    const minutes = meeting.durationMs ? Math.max(1, Math.round(Number(meeting.durationMs) / 60000)) : 0;
    const durationLabel = minutes
      ? minutes >= 60
        ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
        : `${minutes} min`
      : undefined;

    if (status === 'failed') {
      await this.notificationService.queueEmail(
        meeting.userId,
        notificationId,
        `Le traitement de « ${title} » a échoué`,
        MeetingFailedEmail({
          userName: meeting.userName ?? undefined,
          meetingTitle: title,
          meetingUrl,
          startedAt,
          failureReason: meeting.failureReason,
          reference: `MTG-${meeting.id.slice(0, 8).toUpperCase()}`,
        }),
        NotificationType.MEETING_FAILED,
      );
      return;
    }

    const proposals = await this.db
      .selectFrom('meetingActionProposals')
      .select(['title', 'payload'])
      .where('meetingId', '=', meeting.id)
      .where((eb) => eb.or([eb('status', '=', 'proposed'), eb('status', '=', 'draft')]))
      .orderBy('createdAt', 'asc')
      .execute()
      .catch(() => []);
    const items = proposals.map((p) => {
      let payload: Record<string, unknown> = {};
      try {
        payload =
          typeof p.payload === 'string' ? JSON.parse(p.payload) : ((p.payload as any) ?? {});
      } catch {
        payload = {};
      }
      const owner = typeof payload.owner === 'string' ? payload.owner : '';
      const due = typeof payload.dueDate === 'string' ? payload.dueDate : '';
      const dueLabel = due ? formatDateFr(`${due}T12:00:00Z`).split(' à ')[0] : '';
      return {
        title: p.title,
        meta: [owner, dueLabel ? `échéance ${dueLabel}` : 'sans échéance'].filter(Boolean).join(' · '),
      };
    });
    const n = items.length;
    const partial = status === 'partially_failed';
    await this.notificationService.queueEmail(
      meeting.userId,
      notificationId,
      n
        ? `${n} action${n > 1 ? 's' : ''} à valider après « ${title} »`
        : partial
          ? `Transcription prête : ${title}`
          : `Compte rendu prêt : ${title}`,
      MeetingReadyEmail({
        userName: meeting.userName ?? undefined,
        meetingTitle: title,
        meetingUrl,
        startedAt,
        durationLabel,
        proposals: items,
        partial,
      }),
      partial ? NotificationType.MEETING_FAILED : NotificationType.MEETING_READY,
    );
  }
}
