import { getSupabaseClient } from '@/lib/supabase';
import { isIssueCategory } from '@/constants/categories';
import type {
  IssueCategory,
  IssueStatus,
  NotificationRecord,
  NotificationSource,
  NotificationTargetType,
  NotificationType,
} from '@/types';
import { invokeBackendAction } from '@/services/backend-action';
import { READ_REQUEST_TIMEOUT_MS } from '@/lib/request';
import {
  normalizeDate,
  normalizeStatus,
  toReadableBackendError,
} from './issues-core';
import { NOTIFICATION_FEED_PAGE_SIZE } from '@/lib/page-size';

let realtimeChannelSerial = 0;

export type NotificationCursor = { createdAtMs: number; id: string } | null;
export interface NotificationSourcePage {
  cursor: NotificationCursor;
  hasMore: boolean;
  notifications: NotificationRecord[];
}

export interface NotificationReadState {
  admin: Date | null;
  broadcast: Date | null;
  personalPreferences: PersonalPushPreferences;
  user: Date | null;
}

export type PushNotificationPermission = NotificationPermission | 'unsupported';
export type PersonalPushPreferenceKey = 'comments' | 'issueUpdates';

export interface PersonalPushPreferences {
  comments: boolean;
  issueUpdates: boolean;
}

interface PushNotificationPreference {
  deviceEnabled: boolean;
  enabled: boolean;
  personalPreferences: PersonalPushPreferences;
  permission: PushNotificationPermission;
  tokenCount: number;
}

interface GetPushNotificationPreferencePayload {
  deviceId?: string;
  permission?: PushNotificationPermission;
  token?: string;
}

interface RegisterPushTokenPayload {
  deviceId: string;
  permission: NotificationPermission;
  platform: string;
  token: string;
  userAgent: string;
}

interface UnregisterPushTokenPayload {
  deviceId: string;
  permission?: PushNotificationPermission;
  token?: string;
}

interface UpdatePushNotificationPreferencesPayload {
  deviceId: string;
  permission?: PushNotificationPermission;
  preferences: Partial<PersonalPushPreferences>;
  token?: string;
}

function normalizeNotificationType(value: unknown): NotificationType {
  if (
    value === 'announcement_created'
    || value === 'announcement_comment_created'
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

function normalizeNotificationCursor(data: unknown): NotificationCursor {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const createdAt = normalizeDate(record.createdAtMs ?? record.created_at);
  return id && createdAt ? { id, createdAtMs: createdAt.getTime() } : null;
}

function normalizeTargetType(value: unknown): NotificationTargetType {
  return value === 'announcement' ? 'announcement' : 'issue';
}

function normalizeNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeOptionalStatus(value: unknown): IssueStatus | undefined {
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
    target_type: normalizeTargetType(data.target_type),
    target_id: String(data.target_id ?? ''),
    comment_id: normalizeNullableString(data.comment_id),
    title: String(data.title ?? ''),
    actor_uid: normalizeNullableString(data.actor_uid),
    actor_name: normalizeNullableString(data.actor_name),
    actor_photo_url: normalizeNullableString(data.actor_photo_url),
    body_preview: normalizeNullableString(data.body_preview),
    issue_category: isIssueCategory(data.issue_category) ? data.issue_category : null,
    old_status: normalizeOptionalStatus(data.old_status),
    new_status: normalizeOptionalStatus(data.new_status),
    is_read: Boolean(data.is_read),
    created_at: normalizeDate(data.created_at_ms ?? data.created_at),
  };
}

export function subscribeNotificationSource(
  source: NotificationSource,
  uid: string,
  onInsert: (notification: NotificationRecord) => void,
  onError?: (error: Error) => void,
) {
  const client = getSupabaseClient();
  const channelName = `notifications:${source}:${uid}:${realtimeChannelSerial += 1}`;
  const filter = source === "user" ? `recipient_uid=eq.${uid}` : `source=eq.${source}`;
  const channel = client
    .channel(channelName)
    .on('postgres_changes', {
      event: 'INSERT',
      filter,
      schema: 'app_private',
      table: 'notifications',
    }, (payload) => {
      const data = payload.new as Record<string, unknown>;
      if (data.source !== source) return;
      if (source === 'user' && data.recipient_uid !== uid) return;
      onInsert(normalizeNotificationRecord(source, data));
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('notification-realtime-unavailable'));
      }
    });
  return () => {
    void client.removeChannel(channel);
  };
}

export async function fetchNotificationSourcePages(
  requests: Array<{ cursor: NotificationCursor; source: NotificationSource }>,
  uid: string,
  signal?: AbortSignal,
): Promise<Partial<Record<NotificationSource, NotificationSourcePage>>> {
  try {
    const fn = invokeBackendAction<
      { requests: Array<{ cursor: NotificationCursor; pageSize: number; source: NotificationSource }>; uid: string },
      { pages: Partial<Record<NotificationSource, Record<string, unknown>>> }
    >('listNotificationPages', { signal, timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({
      requests: requests.map((request) => ({ ...request, pageSize: NOTIFICATION_FEED_PAGE_SIZE })),
      uid,
    });
    return Object.fromEntries(requests.flatMap(({ source }) => {
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
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export function subscribeNotificationReadState(
  uid: string,
  callback: (state: NotificationReadState) => void,
  onError?: (error: Error) => void,
  loadInitial = true,
) {
  const client = getSupabaseClient();
  const channelName = `notification-state:${uid}:${realtimeChannelSerial += 1}`;
  const loadInitialState = () => {
    void getNotificationReadState(uid)
      .then(callback)
      .catch((error) => onError?.(toReadableBackendError(error)));
  };
  const channel = client
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      filter: `uid=eq.${uid}`,
      schema: 'app_private',
      table: 'notification_states',
    }, (payload) => {
      callback(normalizeNotificationReadState(payload.new as Record<string, unknown>));
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('notification-state-realtime-unavailable'));
      }
    });
  if (loadInitial) loadInitialState();

  return () => {
    void client.removeChannel(channel);
  };
}

async function getNotificationReadState(uid: string): Promise<NotificationReadState> {
  const fn = invokeBackendAction<{ uid: string }, { state: Record<string, unknown> }>('getNotificationReadState', {
    timeoutMs: READ_REQUEST_TIMEOUT_MS,
  });
  const result = await fn({ uid });
  return normalizeNotificationReadState(result.state);
}

export async function fetchNotificationSnapshot(
  sources: NotificationSource[],
  uid: string,
  signal?: AbortSignal,
) {
  const fn = invokeBackendAction<
    { sources: NotificationSource[]; uid: string },
    { openedAtMs: number; pages: Partial<Record<NotificationSource, Record<string, unknown>>>; state: Record<string, unknown> }
  >('getNotificationSnapshot', { signal, timeoutMs: READ_REQUEST_TIMEOUT_MS });
  const result = await fn({ sources, uid });
  return {
    pages: Object.fromEntries(sources.map((source) => {
      const page = result.pages[source] ?? {};
      const notifications = Array.isArray(page.notifications) ? page.notifications : [];
      return [source, {
        cursor: normalizeNotificationCursor(page.cursor),
        hasMore: page.hasMore === true,
        notifications: notifications.map((notification) => normalizeNotificationRecord(
          source,
          notification as Record<string, unknown>,
        )),
      } satisfies NotificationSourcePage];
    })) as Record<NotificationSource, NotificationSourcePage>,
    openedAtMs: result.openedAtMs,
    state: normalizeNotificationReadState(result.state),
  };
}

export async function fetchNotificationUnreadHint() {
  const fn = invokeBackendAction<Record<string, never>, { hasUnread: boolean }>('getNotificationUnreadHint', {
    timeoutMs: READ_REQUEST_TIMEOUT_MS,
  });
  return (await fn({})).hasUnread;
}

export function subscribeNotificationBadge(
  uid: string,
  isAdmin: boolean,
  onNotification: () => void,
  onStateChanged: () => void,
  onError?: (error: Error) => void,
) {
  const client = getSupabaseClient();
  const channel = client.channel(`notification-badge:${uid}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'app_private',
      table: 'notifications',
    }, (payload) => {
      const row = payload.new as Record<string, unknown>;
      const source = row.source;
      if (source === 'broadcast' || source === 'user' || (source === 'admin' && isAdmin)) onNotification();
    })
    .on('postgres_changes', {
      event: '*',
      filter: `uid=eq.${uid}`,
      schema: 'app_private',
      table: 'notification_states',
    }, onStateChanged)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('notification-badge-realtime-unavailable'));
      }
    });
  return () => { void client.removeChannel(channel); };
}

function normalizeNotificationReadState(data: Record<string, unknown>): NotificationReadState {
  return {
    admin: normalizeDate(data.admin_opened_at_ms ?? data.admin_opened_at),
    broadcast: normalizeDate(data.broadcast_opened_at_ms ?? data.broadcast_opened_at),
    personalPreferences: {
      comments: data.push_comments_enabled !== false,
      issueUpdates: data.push_issue_updates_enabled !== false,
    },
    user: normalizeDate(data.user_opened_at_ms ?? data.user_opened_at),
  };
}

export async function markNotificationsOpened() {
  try {
    const fn = invokeBackendAction<Record<string, never>, { openedAtMs: number; success: boolean }>('markNotificationsOpened');
    const result = await fn({});
    return result;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function getPushNotificationPreference(payload: GetPushNotificationPreferencePayload = {}) {
  try {
    const fn = invokeBackendAction<GetPushNotificationPreferencePayload, PushNotificationPreference>('getPushNotificationPreference');
    const result = await fn(payload);
    return result;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function registerPushToken(payload: RegisterPushTokenPayload) {
  try {
    const fn = invokeBackendAction<RegisterPushTokenPayload, PushNotificationPreference>('registerPushToken');
    const result = await fn(payload);
    return result;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function unregisterPushToken(payload: UnregisterPushTokenPayload) {
  try {
    const fn = invokeBackendAction<UnregisterPushTokenPayload, PushNotificationPreference>('unregisterPushToken');
    const result = await fn(payload);
    return result;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function updatePushNotificationPreferences(payload: UpdatePushNotificationPreferencesPayload) {
  try {
    const fn = invokeBackendAction<UpdatePushNotificationPreferencesPayload, PushNotificationPreference>('updatePushNotificationPreferences');
    const result = await fn(payload);
    return result;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
