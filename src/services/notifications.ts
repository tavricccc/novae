import { getSupabaseClient } from '@/lib/supabase';
import { isIssueCategory } from '@/constants/categories';
import type {
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

const NOTIFICATION_SOURCE_PAGE_SIZE = 10;
let realtimeChannelSerial = 0;

type NotificationCursor = { createdAtMs: number; id: string } | null;

interface NotificationSourcePage {
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
  deviceId?: string;
  permission?: PushNotificationPermission;
  token?: string;
}

interface UpdatePushNotificationPreferencesPayload {
  deviceId?: string;
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
  callback: (page: NotificationSourcePage) => void,
  onError?: (error: Error) => void,
) {
  const client = getSupabaseClient();
  const channelName = `notifications:${source}:${uid}:${realtimeChannelSerial += 1}`;
  const refresh = () => {
    void fetchNotificationSourcePage(source, uid, null)
      .then(callback)
      .catch((error) => onError?.(toReadableBackendError(error)));
  };
  const channel = client
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'app_private',
      table: 'notifications',
    }, refresh)
    .subscribe();
  refresh();

  return () => {
    void client.removeChannel(channel);
  };
}

export async function fetchNotificationSourcePage(
  source: NotificationSource,
  uid: string,
  cursor: NotificationCursor,
): Promise<NotificationSourcePage> {
  try {
    const fn = invokeBackendAction<
      { cursor: NotificationCursor; pageSize: number; source: NotificationSource; uid: string },
      { cursor: NotificationCursor; hasMore: boolean; notifications: Record<string, unknown>[] }
    >('listNotifications', { timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({ cursor, pageSize: NOTIFICATION_SOURCE_PAGE_SIZE, source, uid });
    return {
      cursor: normalizeNotificationCursor(result.data.cursor),
      hasMore: result.data.hasMore,
      notifications: result.data.notifications.map((notification) => normalizeNotificationRecord(source, notification)),
    };
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export function subscribeNotificationReadState(
  uid: string,
  callback: (state: NotificationReadState) => void,
  onError?: (error: Error) => void,
) {
  const client = getSupabaseClient();
  const channelName = `notification-state:${uid}:${realtimeChannelSerial += 1}`;
  const refresh = () => {
    void getNotificationReadState(uid)
      .then(callback)
      .catch((error) => onError?.(toReadableBackendError(error)));
  };
  const channel = client
    .channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'app_private',
      table: 'notification_states',
    }, refresh)
    .subscribe();
  refresh();

  return () => {
    void client.removeChannel(channel);
  };
}

async function getNotificationReadState(uid: string): Promise<NotificationReadState> {
  const fn = invokeBackendAction<{ uid: string }, { state: Record<string, unknown> }>('getNotificationReadState', {
    timeoutMs: READ_REQUEST_TIMEOUT_MS,
  });
  const result = await fn({ uid });
  const data = result.data.state;
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
    return result.data;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function getPushNotificationPreference(payload: GetPushNotificationPreferencePayload = {}) {
  try {
    const fn = invokeBackendAction<GetPushNotificationPreferencePayload, PushNotificationPreference>('getPushNotificationPreference');
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function registerPushToken(payload: RegisterPushTokenPayload) {
  try {
    const fn = invokeBackendAction<RegisterPushTokenPayload, PushNotificationPreference>('registerPushToken');
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function unregisterPushToken(payload: UnregisterPushTokenPayload = {}) {
  try {
    const fn = invokeBackendAction<UnregisterPushTokenPayload, PushNotificationPreference>('unregisterPushToken');
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function updatePushNotificationPreferences(payload: UpdatePushNotificationPreferencesPayload) {
  try {
    const fn = invokeBackendAction<UpdatePushNotificationPreferencesPayload, PushNotificationPreference>('updatePushNotificationPreferences');
    const result = await fn(payload);
    return result.data;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
