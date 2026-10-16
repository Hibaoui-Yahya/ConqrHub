import { NotificationService } from './notification.service';
import {
  isNotificationEnabled,
  NOTIFICATION_SETTING_KEYS,
  NotificationType,
  NotificationTypeToSettingKey,
} from './notification.constants';

/** users.settings the stub database answers with. */
function makeService(settings: Record<string, unknown> | null) {
  const qb: any = {};
  for (const m of ['select', 'where']) qb[m] = jest.fn(() => qb);
  qb.executeTakeFirst = jest.fn(async () => ({
    id: 'u-1',
    email: 'person@example.test',
    settings,
  }));
  const db = { selectFrom: jest.fn(() => qb) };
  const notificationRepo = {
    insert: jest.fn(async (d: any) => ({ id: 'n-1', ...d })),
  };
  const emit = jest.fn();
  const wsGateway = { server: { to: jest.fn(() => ({ emit })) } };
  const mailService = { sendToQueue: jest.fn(async () => undefined) };
  const service = new NotificationService(
    notificationRepo as any,
    {} as any,
    wsGateway as any,
    mailService as any,
    db as any,
  );
  return { service, notificationRepo, emit, mailService };
}

const verificationExpiring = {
  userId: 'u-1',
  workspaceId: 'ws-1',
  type: NotificationType.PAGE_VERIFICATION_EXPIRING,
  pageId: 'p-1',
  spaceId: 's-1',
};

describe('notification preferences', () => {
  it('gives every notification type a preference', () => {
    for (const type of Object.values(NotificationType)) {
      expect(NOTIFICATION_SETTING_KEYS).toContain(
        NotificationTypeToSettingKey[type],
      );
    }
  });

  it('delivers by default and when the switch is absent', () => {
    expect(isNotificationEnabled(null, NotificationType.MEETING_READY, 'inApp')).toBe(true);
    expect(
      isNotificationEnabled({ notifications: {} }, NotificationType.MEETING_READY, 'email'),
    ).toBe(true);
  });

  it('stores and pushes a notification whose bell is on', async () => {
    const { service, notificationRepo, emit } = makeService({});
    const n = await service.create(verificationExpiring);
    expect(n?.id).toBe('n-1');
    expect(notificationRepo.insert).toHaveBeenCalled();
    expect(emit).toHaveBeenCalled();
  });

  it('does not deliver a type turned off in both channels', async () => {
    const { service, notificationRepo, emit, mailService } = makeService({
      inAppNotifications: { 'page.verification': false },
      notifications: { 'page.verification': false },
    });

    const n = await service.create(verificationExpiring);
    expect(n).toBeNull();
    expect(notificationRepo.insert).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    await service.queueEmail(
      'u-1',
      'n-x',
      'subject',
      {},
      NotificationType.PAGE_VERIFICATION_EXPIRING,
    );
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
  });

  it('keeps the e-mail when only the bell is off', async () => {
    const { service, notificationRepo, emit, mailService } = makeService({
      inAppNotifications: { 'meeting.ready': false },
    });
    const n = await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      type: NotificationType.MEETING_READY,
    });
    expect(n).toEqual({ id: null, suppressed: true });
    expect(notificationRepo.insert).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();

    await service.queueEmail('u-1', n!.id, 'subject', {}, NotificationType.MEETING_READY);
    expect(mailService.sendToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'person@example.test', notificationId: undefined }),
    );
  });

  it('keeps the bell when only the e-mail is off', async () => {
    const { service, notificationRepo, mailService } = makeService({
      notifications: { 'docHealth.dropped': false },
    });
    const n = await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      type: NotificationType.DOC_HEALTH_DROPPED,
    });
    expect(n?.id).toBe('n-1');
    expect(notificationRepo.insert).toHaveBeenCalled();

    await service.queueEmail('u-1', 'n-1', 's', {}, NotificationType.DOC_HEALTH_DROPPED);
    expect(mailService.sendToQueue).not.toHaveBeenCalled();
  });

  it('a switch only affects its own kind', async () => {
    const { service, notificationRepo } = makeService({
      inAppNotifications: { 'page.approval': false },
    });
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      type: NotificationType.PAGE_APPROVAL_REQUESTED,
    });
    expect(notificationRepo.insert).not.toHaveBeenCalled();
    await service.create({
      userId: 'u-1',
      workspaceId: 'ws-1',
      type: NotificationType.COMMENT_CREATED,
    });
    expect(notificationRepo.insert).toHaveBeenCalledTimes(1);
  });
});
