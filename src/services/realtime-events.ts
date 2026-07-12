import { getSupabaseClient } from '@/lib/supabase';
import { isIssueCategory } from '@/constants/categories';
import type { IssueCategory } from '@/types';

type SupabaseAppClient = ReturnType<typeof getSupabaseClient>;
type RealtimeChannel = ReturnType<SupabaseAppClient['channel']>;
interface RealtimeSubscriber {
  callback: (event: ContentRealtimeEvent) => void;
  onError?: (error: Error) => void;
}

const realtimeSubscribers = new Map<number, RealtimeSubscriber>();
let realtimeSubscriberSerial = 0;
let realtimeChannelSerial = 0;
let sharedRealtimeChannel: RealtimeChannel | null = null;
let reconnectAttempt = 0;
let reconnectTimer = 0;

function clearReconnectTimer() {
  window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
}

function scheduleReconnect() {
  if (realtimeSubscribers.size === 0 || reconnectTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    ensureSharedRealtimeChannel();
  }, delay);
}

export type ContentRealtimeEventType =
  | 'issue_changed'
  | 'issue_support_changed'
  | 'issue_comment_changed'
  | 'announcement_changed'
  | 'announcement_metrics_changed'
  | 'announcement_comment_changed';

export interface ContentRealtimeEvent {
  category: IssueCategory | null;
  commentCount: number | null;
  createdAt: Date | null;
  eventType: ContentRealtimeEventType;
  parentId: string | null;
  likeCount: number | null;
  op: 'insert' | 'update' | 'delete' | null;
  supportCount: number | null;
  targetId: string;
}

function normalizeNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeDate(value: unknown) {
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time) : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value);
  }
  return null;
}

function normalizeEventType(value: unknown): ContentRealtimeEventType | null {
  if (
    value === 'issue_changed'
    || value === 'issue_support_changed'
    || value === 'issue_comment_changed'
    || value === 'announcement_changed'
    || value === 'announcement_metrics_changed'
    || value === 'announcement_comment_changed'
  ) {
    return value;
  }
  return null;
}

function normalizeRealtimeEvent(data: Record<string, unknown>): ContentRealtimeEvent | null {
  const eventType = normalizeEventType(data.event_type);
  const targetId = normalizeNullableString(data.target_id);
  if (!eventType || !targetId) return null;

  return {
    category: isIssueCategory(data.category) ? data.category : null,
    commentCount: typeof data.comment_count === 'number' && Number.isFinite(data.comment_count)
      ? data.comment_count
      : null,
    createdAt: normalizeDate(data.created_at),
    eventType,
    likeCount: typeof data.like_count === 'number' && Number.isFinite(data.like_count)
      ? data.like_count
      : null,
    op: data.op === 'insert' || data.op === 'update' || data.op === 'delete' ? data.op : null,
    parentId: normalizeNullableString(data.parent_id),
    supportCount: typeof data.support_count === 'number' && Number.isFinite(data.support_count)
      ? data.support_count
      : null,
    targetId,
  };
}

function ensureSharedRealtimeChannel() {
  if (sharedRealtimeChannel || realtimeSubscribers.size === 0) return;
  clearReconnectTimer();
  const client = getSupabaseClient();
  const channel = client
    .channel(`content-realtime:shared:${realtimeChannelSerial += 1}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'app_private',
      table: 'realtime_events',
    }, (payload) => {
      const event = normalizeRealtimeEvent(payload.new as Record<string, unknown>);
      if (!event) return;
      realtimeSubscribers.forEach((subscriber) => subscriber.callback(event));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        reconnectAttempt = 0;
        return;
      }
      if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
      if (sharedRealtimeChannel !== channel) return;
      sharedRealtimeChannel = null;
      const error = new Error('content-realtime-unavailable');
      realtimeSubscribers.forEach((subscriber) => subscriber.onError?.(error));
      void client.removeChannel(channel);
      scheduleReconnect();
    });
  sharedRealtimeChannel = channel;
}

export function subscribeContentRealtimeEvents(
  channelScope: string,
  callback: (event: ContentRealtimeEvent) => void,
  onError?: (error: Error) => void,
) {
  void channelScope;
  const subscriberId = realtimeSubscriberSerial += 1;
  realtimeSubscribers.set(subscriberId, { callback, onError });
  ensureSharedRealtimeChannel();

  return () => {
    realtimeSubscribers.delete(subscriberId);
    if (realtimeSubscribers.size > 0) return;
    clearReconnectTimer();
    reconnectAttempt = 0;
    if (!sharedRealtimeChannel) return;
    const client = getSupabaseClient();
    const channel = sharedRealtimeChannel;
    sharedRealtimeChannel = null;
    void client.removeChannel(channel);
  };
}
