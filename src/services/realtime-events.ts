import { getSupabaseClient } from '@/lib/supabase';
import { isIssueCategory } from '@/constants/categories';
import type { IssueCategory } from '@/types';

let realtimeEventChannelSerial = 0;

export type ContentRealtimeEventType =
  | 'issue_changed'
  | 'issue_comment_changed'
  | 'announcement_changed'
  | 'announcement_comment_changed';

export interface ContentRealtimeEvent {
  actorUid: string | null;
  category: IssueCategory | null;
  createdAt: Date | null;
  eventType: ContentRealtimeEventType;
  parentId: string | null;
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
    || value === 'issue_comment_changed'
    || value === 'announcement_changed'
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
    actorUid: normalizeNullableString(data.actor_uid),
    category: isIssueCategory(data.category) ? data.category : null,
    createdAt: normalizeDate(data.created_at),
    eventType,
    parentId: normalizeNullableString(data.parent_id),
    targetId,
  };
}

export function subscribeContentRealtimeEvents(
  channelScope: string,
  callback: (event: ContentRealtimeEvent) => void,
  onError?: (error: Error) => void,
) {
  const client = getSupabaseClient();
  const channelName = `content-realtime:${channelScope}:${realtimeEventChannelSerial += 1}`;
  const channel = client
    .channel(channelName)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'app_private',
      table: 'realtime_events',
    }, (payload) => {
      const event = normalizeRealtimeEvent(payload.new as Record<string, unknown>);
      if (event) callback(event);
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(new Error('content-realtime-unavailable'));
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
