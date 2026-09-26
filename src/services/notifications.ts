import { subscribeRealtimeTopic } from '@/services/realtime-transport';
import { isIssueCategory } from '@/constants/categories';
import type {
  IssueStatus,
  NotificationRecord,
  NotificationSource,
  NotificationTargetType,
  NotificationType,
} from '@/types';
import { invokeBackendAction } from '@/services/backend-action';
import { readRequestTimeoutMs } from '@/lib/request';
import {
  normalizeDate,
  normalizeStatus,
  toReadableBackendError,
} from './issues-core';
import { NOTIFICATION_FEED_PAGE_SIZE } from '@/lib/page-size';
import { normalizeNotificationCursor, type NotificationCursor } from './notification-cursor';
export type { NotificationCursor } from './notification-cursor';
import {
  CONTENT_SHORT_CACHE_TTL_MS,
  captureContentCacheWriteGuard,
  createContentCacheKey,
  getCachedContentPersistent,
  markContentCachePrefixStale,
  setCachedContent,
  setCachedContentFromRead,
} from '@/services/content-read-cache';

const NOTIFICATION_PAGES_CACHE_PREFIX = 'notification-pages|';
const NOTIFICATION_STATE_CACHE_KEY = 'notification-read-state';
const NOTIFICATION_UNREAD_CACHE_KEY = 'notification-unread-hint';
const NOTIFICATION_HINT_CACHE_TTL_MS = 2 * 60_000;

type NotificationBroadcastEvent = 'notification_insert' | 'notification_state_changed';

function subscribeNotificationBroadcast(
  topic: string,
  event: NotificationBroadcastEvent,
  callback: (message: { payload: Record<string, unknown> }) => void,
  onError?: (error: Error) => void,
  onResync?: () => void,
) {
  return subscribeRealtimeTopic(topic, event, (payload) => {
    if (event === 'notification_insert') {
      markContentCachePrefixStale(NOTIFICATION_PAGES_CACHE_PREFIX);
      markContentCachePrefixStale(NOTIFICATION_UNREAD_CACHE_KEY);
      if (payload.type === 'facility_status_changed' || payload.type === 'facility_report_created') {
        markContentCachePrefixStale('facility-list-page|');
        markContentCachePrefixStale('facility-detail|');
      }
    } else {
      markContentCachePrefixStale(NOTIFICATION_STATE_CACHE_KEY);
      markContentCachePrefixStale(NOTIFICATION_UNREAD_CACHE_KEY);
    }
    callback({ payload });
  }, { onError, onResync });
}

export interface NotificationSourcePage {
  cursor: NotificationCursor;
  hasMore: boolean;
  notifications: NotificationRecord[];
}

export interface NotificationReadState {
  admin: Date | null;
  announcement: Date | null;
  broadcast: Date | null;
  user: Date | null;
}

function normalizeNotificationType(value: unknown): NotificationType {
  if (
    value === 'announcement_created'
    || value === 'announcement_comment_created'
    || value === 'facility_status_changed'
    || value === 'facility_report_created'
    || value === 'issue_created'
    || value === 'issue_comment_created'
    || value === 'issue_status_changed'
    || value === 'support_goal_met'
    || value === 'issue_deleted'
  ) {
    return value;
  }
  return 'issue_comment_created';
}

function normalizeTargetType(value: unknown): NotificationTargetType {
  return value === 'announcement' || value === 'facility' ? value : 'issue';
}

function normalizeNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeOptionalStatus(value: unknown): IssueStatus | import('@/types').FacilityStatus | undefined {
  if (value === 'unable-to-handle') return value;
  return typeof value === 'string' ? normalizeStatus(value) : undefined;
}

function normalizeNotificationRecord(
  source: NotificationSource,
  data: Record<string, unknown>,
): NotificationRecord {
  const id = String(data.id ?? '');
  return {
    id: `${source}:${id}`,
    source,
    type: normalizeNotificationType(data.type),
    target_type: normalizeTargetType(data.targetType),
    target_id: String(data.targetId ?? ''),
    comment_id: normalizeNullableString(data.commentId),
    title: String(data.title ?? ''),
    actor_uid: normalizeNullableString(data.actorUid),
    body_preview: normalizeNullableString(data.bodyPreview),
    issue_category: isIssueCategory(data.issueCategory) ? data.issueCategory : null,
    old_status: normalizeOptionalStatus(data.oldStatus),
    new_status: normalizeOptionalStatus(data.newStatus),
    is_read: Boolean(data.isRead),
    created_at: normalizeDate(data.createdAt),
  };
}

export function subscribeNotificationSource(
  source: NotificationSource,
  uid: string,
  onInsert: (notification: NotificationRecord) => void,
  onError?: (error: Error) => void,
  onResync?: () => void,
) {
  const channelName = source === 'user' ? `notifications:user:${uid}` : `notifications:${source}`;
  return subscribeNotificationBroadcast(
    channelName,
    'notification_insert',
    (message) => {
      const data = message.payload as Record<string, unknown>;
      if (data.source !== source) return;
      if (source === 'user' && data.recipientUid !== uid) return;
      onInsert(normalizeNotificationRecord(source, data));
    },
    onError,
    onResync,
  );
}

export async function fetchNotificationSourcePages(
  requests: Array<{ cursor: NotificationCursor; source: NotificationSource }>,
  uid: string,
  signal?: AbortSignal,
): Promise<Partial<Record<NotificationSource, NotificationSourcePage>>> {
  const cacheKey = createContentCacheKey([
    'notification-pages',
    uid,
    ...requests.map(({ cursor, source }) => `${source}:${cursor?.id ?? 'first'}:${cursor?.createdAt ?? ''}`),
  ]);
  const cached = await getCachedContentPersistent<Partial<Record<NotificationSource, NotificationSourcePage>>>(
    cacheKey,
    CONTENT_SHORT_CACHE_TTL_MS,
  );
  if (cached) return cached;
  const cacheGuard = captureContentCacheWriteGuard(cacheKey);

  try {
    const fn = invokeBackendAction<
      { requests: Array<{ cursor: NotificationCursor; pageSize: number; source: NotificationSource }>; uid: string },
      { pages: Partial<Record<NotificationSource, Record<string, unknown>>> }
    >('listNotificationPages', { signal, timeoutMs: readRequestTimeoutMs });
    const result = await fn({
      requests: requests.map((request) => ({ ...request, pageSize: NOTIFICATION_FEED_PAGE_SIZE })),
      uid,
    });
    const pages = Object.fromEntries(requests.flatMap(({ source }) => {
      const page = result.pages[source];
      if (!page) return [];
      const notifications = Array.isArray(page.notifications) ? page.notifications : [];
      return [[source, {
        cursor: normalizeNotificationCursor(page.cursor),
        hasMore: page.hasMore === true,
        notifications: notifications.map((notification) => normalizeNotificationRecord(
          source,
          notification as Record<string, unknown>,
        )),
      } satisfies NotificationSourcePage]];
    })) as Partial<Record<NotificationSource, NotificationSourcePage>>;
    setCachedContentFromRead(cacheGuard, pages);
    return pages;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export function subscribeNotificationReadState(
  uid: string,
  callback: (state: NotificationReadState) => void,
  onError?: (error: Error) => void,
  loadInitial = true,
  onResync?: () => void,
) {
  const channelName = `notification-state:${uid}`;
  const loadInitialState = () => {
    void getNotificationReadState(uid)
      .then(callback)
      .catch((error) => onError?.(toReadableBackendError(error)));
  };
  const unsubscribe = subscribeNotificationBroadcast(
    channelName,
    'notification_state_changed',
    (message) => {
      callback(normalizeNotificationReadState(message.payload as Record<string, unknown>));
    },
    onError,
    onResync,
  );
  if (loadInitial) loadInitialState();
  return unsubscribe;
}

async function getNotificationReadState(uid: string): Promise<NotificationReadState> {
  const cached = await getCachedContentPersistent<NotificationReadState>(
    NOTIFICATION_STATE_CACHE_KEY,
    CONTENT_SHORT_CACHE_TTL_MS,
  );
  if (cached) return cached;
  const cacheGuard = captureContentCacheWriteGuard(NOTIFICATION_STATE_CACHE_KEY);
  const fn = invokeBackendAction<{ uid: string }, { state: Record<string, unknown> }>('getNotificationReadState', {
    timeoutMs: readRequestTimeoutMs,
  });
  const result = await fn({ uid });
  const state = normalizeNotificationReadState(result.state);
  setCachedContentFromRead(cacheGuard, state);
  return state;
}

export async function fetchNotificationSnapshot(
  sources: NotificationSource[],
  uid: string,
  options: {
    onPages?: (pages: Record<NotificationSource, NotificationSourcePage>) => void;
    signal?: AbortSignal;
  } = {},
) {
  const normalizePages = (value: Partial<Record<NotificationSource, Record<string, unknown>>>) =>
    Object.fromEntries(sources.map((source) => {
      const page = value[source] ?? {};
      const notifications = Array.isArray(page.notifications) ? page.notifications : [];
      return [source, {
        cursor: normalizeNotificationCursor(page.cursor),
        hasMore: page.hasMore === true,
        notifications: notifications.map((notification) => normalizeNotificationRecord(
          source,
          notification as Record<string, unknown>,
        )),
      } satisfies NotificationSourcePage];
    })) as Record<NotificationSource, NotificationSourcePage>;
  const fn = invokeBackendAction<
    { sources: NotificationSource[]; uid: string },
    { openedAt: string; pages: Partial<Record<NotificationSource, Record<string, unknown>>>; state: Record<string, unknown> }
  >('getNotificationSnapshot', {
    onSegment: (key, data) => {
      if (key === 'pages') options.onPages?.(normalizePages(data as Partial<Record<NotificationSource, Record<string, unknown>>>));
    },
    signal: options.signal,
    timeoutMs: readRequestTimeoutMs,
  });
  const result = await fn({ sources, uid });
  return {
    pages: normalizePages(result.pages),
    state: normalizeNotificationReadState(result.state),
  };
}

export function seedNotificationUnreadHint(hasUnread: boolean) {
  setCachedContent(NOTIFICATION_UNREAD_CACHE_KEY, { value: hasUnread === true });
  return hasUnread === true;
}

export async function fetchNotificationUnreadHint() {
  const cached = await getCachedContentPersistent<{ value: boolean }>(
    NOTIFICATION_UNREAD_CACHE_KEY,
    NOTIFICATION_HINT_CACHE_TTL_MS,
  );
  if (cached) return cached.value;
  const cacheGuard = captureContentCacheWriteGuard(NOTIFICATION_UNREAD_CACHE_KEY);
  const fn = invokeBackendAction<Record<string, never>, { hasUnread: boolean }>('getNotificationUnreadHint', {
    timeoutMs: readRequestTimeoutMs,
  });
  const value = (await fn({})).hasUnread;
  setCachedContentFromRead(cacheGuard, { value });
  return value;
}

export function subscribeNotificationBadge(
  uid: string,
  isAdmin: boolean,
  onNotification: () => void,
  onStateChanged: () => void,
  onError?: (error: Error) => void,
  onResync?: () => void,
) {
  const topics = [
    'notifications:broadcast',
    `notifications:user:${uid}`,
    ...(isAdmin ? ['notifications:admin'] as const : []),
    `notification-state:${uid}`,
  ];
  const unsubscribers = topics.map((topic) => subscribeNotificationBroadcast(
    topic,
    topic.startsWith('notification-state:') ? 'notification_state_changed' : 'notification_insert',
    topic.startsWith('notification-state:') ? onStateChanged : onNotification,
    onError,
    onResync ?? onStateChanged,
  ));
  return () => { unsubscribers.forEach((unsubscribe) => unsubscribe()); };
}

function normalizeNotificationReadState(data: Record<string, unknown>): NotificationReadState {
  return {
    admin: normalizeDate(data.adminOpenedAt),
    announcement: normalizeDate(data.announcementOpenedAt),
    broadcast: normalizeDate(data.broadcastOpenedAt),
    user: normalizeDate(data.userOpenedAt),
  };
}

export async function markNotificationsOpened() {
  try {
    const fn = invokeBackendAction<Record<string, never>, { openedAt: string; success: boolean }>('markNotificationsOpened');
    const result = await fn({});
    markContentCachePrefixStale(NOTIFICATION_STATE_CACHE_KEY);
    setCachedContent(NOTIFICATION_UNREAD_CACHE_KEY, { value: false });
    return result;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
