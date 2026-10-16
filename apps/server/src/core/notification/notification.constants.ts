export const NotificationType = {
  COMMENT_USER_MENTION: 'comment.user_mention',
  COMMENT_CREATED: 'comment.created',
  COMMENT_RESOLVED: 'comment.resolved',
  PAGE_USER_MENTION: 'page.user_mention',
  PAGE_PERMISSION_GRANTED: 'page.permission_granted',
  PAGE_UPDATED: 'page.updated',
  PAGE_VERIFICATION_EXPIRING: 'page.verification_expiring',
  PAGE_VERIFICATION_EXPIRED: 'page.verification_expired',
  PAGE_VERIFICATION_INVALIDATED: 'page.verification_invalidated',
  PAGE_VERIFIED: 'page.verified',
  PAGE_APPROVAL_REQUESTED: 'page.approval_requested',
  PAGE_APPROVAL_REJECTED: 'page.approval_rejected',
  DOC_HEALTH_DROPPED: 'doc_health.dropped',
  // ConqrMeet pipeline (one bell for the whole suite)
  MEETING_READY: 'meeting.ready',
  MEETING_FAILED: 'meeting.failed',
  MEETING_REVIEW_NEEDED: 'meeting.review_needed',
  MEETING_PUBLISHED: 'meeting.published',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

/**
 * One preference per kind of notification. Each has two channels, stored on
 * the user: `settings.notifications[key]` for e-mail (the historic place)
 * and `settings.inAppNotifications[key]` for the bell. Absent means on.
 */
export const NOTIFICATION_SETTING_KEYS = [
  'page.updated',
  'page.userMention',
  'comment.userMention',
  'comment.created',
  'comment.resolved',
  'page.permissionGranted',
  'page.verification',
  'page.approval',
  'docHealth.dropped',
  'meeting.ready',
  'meeting.failed',
  'meeting.reviewNeeded',
  'meeting.published',
] as const;

export type NotificationSettingKey = (typeof NOTIFICATION_SETTING_KEYS)[number];

export type NotificationChannel = 'email' | 'inApp';

/** Where each channel's switches live in `users.settings`. */
export const NOTIFICATION_CHANNEL_SETTINGS: Record<
  NotificationChannel,
  'notifications' | 'inAppNotifications'
> = {
  email: 'notifications',
  inApp: 'inAppNotifications',
};

export const NotificationTypeToSettingKey: Record<
  NotificationType,
  NotificationSettingKey
> = {
  [NotificationType.PAGE_UPDATED]: 'page.updated',
  [NotificationType.PAGE_USER_MENTION]: 'page.userMention',
  [NotificationType.COMMENT_USER_MENTION]: 'comment.userMention',
  [NotificationType.COMMENT_CREATED]: 'comment.created',
  [NotificationType.COMMENT_RESOLVED]: 'comment.resolved',
  [NotificationType.PAGE_PERMISSION_GRANTED]: 'page.permissionGranted',
  [NotificationType.PAGE_VERIFICATION_EXPIRING]: 'page.verification',
  [NotificationType.PAGE_VERIFICATION_EXPIRED]: 'page.verification',
  [NotificationType.PAGE_VERIFICATION_INVALIDATED]: 'page.verification',
  [NotificationType.PAGE_VERIFIED]: 'page.verification',
  [NotificationType.PAGE_APPROVAL_REQUESTED]: 'page.approval',
  [NotificationType.PAGE_APPROVAL_REJECTED]: 'page.approval',
  [NotificationType.DOC_HEALTH_DROPPED]: 'docHealth.dropped',
  [NotificationType.MEETING_READY]: 'meeting.ready',
  [NotificationType.MEETING_FAILED]: 'meeting.failed',
  [NotificationType.MEETING_REVIEW_NEEDED]: 'meeting.reviewNeeded',
  [NotificationType.MEETING_PUBLISHED]: 'meeting.published',
};

/**
 * Whether a user's settings let a notification type through a channel.
 * Unknown types and missing settings are delivered (opt-out model).
 */
export function isNotificationEnabled(
  settings: unknown,
  type: string,
  channel: NotificationChannel,
): boolean {
  const key = NotificationTypeToSettingKey[type as NotificationType];
  if (!key) return true;
  const bucket = (settings as Record<string, any> | null | undefined)?.[
    NOTIFICATION_CHANNEL_SETTINGS[channel]
  ];
  return bucket?.[key] !== false;
}

export type NotificationTab = 'direct' | 'updates' | 'all';

export const DIRECT_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.COMMENT_USER_MENTION,
  NotificationType.COMMENT_CREATED,
  NotificationType.COMMENT_RESOLVED,
  NotificationType.PAGE_USER_MENTION,
  NotificationType.PAGE_PERMISSION_GRANTED,
  NotificationType.DOC_HEALTH_DROPPED,
  NotificationType.MEETING_READY,
  NotificationType.MEETING_FAILED,
  NotificationType.MEETING_REVIEW_NEEDED,
  NotificationType.MEETING_PUBLISHED,
];

export const UPDATES_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.PAGE_UPDATED,
];

export function getTypesForTab(tab: NotificationTab): NotificationType[] | undefined {
  if (tab === 'direct') return DIRECT_NOTIFICATION_TYPES;
  if (tab === 'updates') return UPDATES_NOTIFICATION_TYPES;
  return undefined;
}
