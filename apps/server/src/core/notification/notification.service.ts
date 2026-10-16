import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { NotificationRepo } from '@docmost/db/repos/notification/notification.repo';
import {
  InsertableNotification,
  Notification,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { WsGateway } from '../../ws/ws.gateway';
import { MailService } from '../../integrations/mail/mail.service';
import {
  isNotificationEnabled,
  NotificationTab,
  NotificationType,
} from './notification.constants';

/** The bell is off for this type but the e-mail is still wanted. */
export type SuppressedNotification = { id: null; suppressed: true };
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly notificationRepo: NotificationRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly wsGateway: WsGateway,
    private readonly mailService: MailService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  /**
   * Record an in-app notification, unless the person turned that kind off.
   *
   * Returns null when nothing should reach the person at all (inactive user,
   * or both channels off for this type), so callers skip the e-mail too.
   * When only the bell is off, nothing is stored and a placeholder with a
   * null id is returned: callers still queue the e-mail, which checks its
   * own switch.
   */
  async create(
    data: InsertableNotification,
  ): Promise<Notification | SuppressedNotification | null> {
    const user = await this.db
      .selectFrom('users')
      .select(['id', 'settings'])
      .where('id', '=', data.userId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .executeTakeFirst();

    if (!user) return null;

    if (!isNotificationEnabled(user.settings, data.type, 'inApp')) {
      return isNotificationEnabled(user.settings, data.type, 'email')
        ? { id: null, suppressed: true }
        : null;
    }

    const notification = await this.notificationRepo.insert(data);

    this.wsGateway.server
      .to(`user-${data.userId}`)
      .emit('notification', { id: notification.id, type: notification.type });

    return notification;
  }

  async findByUserId(
    userId: string,
    pagination: PaginationOptions,
    type: NotificationTab = 'all',
  ) {
    const result = await this.notificationRepo.findByUserId(
      userId,
      pagination,
      type,
    );

    const pageIds = result.items
      .map((n: any) => n.pageId)
      .filter(Boolean);

    if (pageIds.length > 0) {
      const accessiblePageIds =
        await this.pagePermissionRepo.filterAccessiblePageIds({
          pageIds,
          userId,
        });
      const accessibleSet = new Set(accessiblePageIds);

      result.items = result.items.filter(
        (n: any) => !n.pageId || accessibleSet.has(n.pageId),
      );
    }

    return result;
  }

  async getUnreadCount(userId: string) {
    return this.notificationRepo.getUnreadCount(userId);
  }

  async markAsRead(notificationId: string, userId: string) {
    return this.notificationRepo.markAsRead(notificationId, userId);
  }

  async markMultipleAsRead(notificationIds: string[], userId: string) {
    return this.notificationRepo.markMultipleAsRead(notificationIds, userId);
  }

  async markAllAsRead(userId: string) {
    return this.notificationRepo.markAllAsRead(userId);
  }

  async queueEmail(
    userId: string,
    notificationId: string | null,
    subject: string,
    template: any,
    type?: NotificationType,
  ) {
    try {
      const user = await this.db
        .selectFrom('users')
        .select(['email', 'settings'])
        .where('id', '=', userId)
        .where('deletedAt', 'is', null)
        .where('deactivatedAt', 'is', null)
        .executeTakeFirst();

      if (!user?.email) return;

      if (type && !isNotificationEnabled(user.settings, type, 'email')) return;

      await this.mailService.sendToQueue({
        to: user.email,
        subject,
        template,
        notificationId: notificationId ?? undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to queue email for notification ${notificationId}: ${message}`,
      );
    }
  }
}
