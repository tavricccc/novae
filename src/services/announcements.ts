import type {
  AnnouncementCommentRecord,
  AnnouncementInput,
  AnnouncementRecord,
} from '@/types';
import { invokeBackendAction } from '@/services/backend-action';
import { createRequestId } from '@/lib/request-id';
import { READ_REQUEST_TIMEOUT_MS, RequestFailure } from '@/lib/request';
import {
  createContentCacheKey,
  getCachedContent,
  markContentCachePrefixStale,
  setCachedContent,
} from '@/services/content-read-cache';
import { normalizeDate, toReadableBackendError } from '@/services/issues-core';
import type { CommentCursor } from './comment-cursor';
import { normalizeCommentCursor } from './comment-cursor';
import { COMMENT_FEED_PAGE_SIZE } from '@/lib/page-size';

const ANNOUNCEMENT_LIMIT = 10;
const ANNOUNCEMENT_LIST_CACHE_PREFIX = 'announcement-list-page|';
const ANNOUNCEMENT_COMMENTS_CACHE_PREFIX = 'announcement-comments-page|';
export type AnnouncementCursor = { id: string; publishedAtMs: number } | null;

function dateFromMs(value: unknown) {
  return typeof value === 'number' ? new Date(value) : normalizeDate(value);
}

function numberFromDateLike(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const date = normalizeDate(value);
  return date ? date.getTime() : null;
}

function normalizeAnnouncementCursor(data: unknown): AnnouncementCursor {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const publishedAtMs = numberFromDateLike(record.publishedAtMs ?? record.published_at);
  if (!id || publishedAtMs === null) return null;
  return {
    id,
    publishedAtMs,
  };
}

function normalizeAnnouncementRecord(data: Record<string, unknown>): AnnouncementRecord {
  return {
    id: String(data.id ?? ''),
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    author_uid: String(data.author_uid ?? ''),
    author_name: String(data.author_name ?? '管理員'),
    author_photo_url: data.author_photo_url ? String(data.author_photo_url) : null,
    published_at: dateFromMs(data.published_at_ms ?? data.published_at),
    like_count: Number(data.like_count ?? 0),
    comment_count: Number(data.comment_count ?? 0),
    currentUserLiked: Boolean(data.currentUserLiked),
    deleting: data.deleting === true,
  };
}

function normalizeAnnouncementComment(data: Record<string, unknown>): AnnouncementCommentRecord {
  return {
    id: String(data.id ?? ''),
    announcement_id: String(data.announcement_id ?? ''),
    parent_comment_id: typeof data.parent_comment_id === 'string' ? data.parent_comment_id : null,
    content: String(data.content ?? ''),
    author_uid: String(data.author_uid ?? ''),
    author_name: String(data.author_name ?? '管理員'),
    author_photo_url: data.author_photo_url ? String(data.author_photo_url) : null,
    created_at: dateFromMs(data.created_at_ms ?? data.created_at),
    replies: Array.isArray(data.replies)
      ? data.replies.map((reply) => normalizeAnnouncementComment({
        ...(reply as Record<string, unknown>),
        announcement_id: data.announcement_id,
      }))
      : [],
  };
}

export async function fetchAnnouncementsPage(
  cursor: AnnouncementCursor = null,
  pageSize = ANNOUNCEMENT_LIMIT,
  options: { cacheScope?: string; forceRefresh?: boolean; signal?: AbortSignal } = {},
) {
  const cacheKey = createContentCacheKey([
    'announcement-list-page',
    options.cacheScope ?? 'default',
    pageSize,
    cursor?.id ?? 'first',
    cursor?.publishedAtMs ?? '',
  ]);
  if (!options.forceRefresh) {
    const cached = getCachedContent<{ announcements: AnnouncementRecord[]; cursor: AnnouncementCursor; hasMore: boolean }>(cacheKey);
    if (cached) return cached;
  }

  try {
    const fn = invokeBackendAction<
      { cursor: AnnouncementCursor; pageSize: number },
      { announcements: Record<string, unknown>[]; cursor: AnnouncementCursor; hasMore: boolean }
    >('listAnnouncements', { signal: options.signal, timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({ cursor, pageSize });
    const page = {
      announcements: result.announcements.map(normalizeAnnouncementRecord),
      cursor: normalizeAnnouncementCursor(result.cursor),
      hasMore: result.hasMore,
    };
    setCachedContent(cacheKey, page);
    return page;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function fetchAnnouncementRecordById(
  announcementId: string,
  options: { cacheScope?: string; forceRefresh?: boolean } = {},
): Promise<AnnouncementRecord> {
  const cacheKey = createContentCacheKey(['announcement-detail', options.cacheScope ?? 'default', announcementId]);
  if (!options.forceRefresh) {
    const cached = getCachedContent<AnnouncementRecord>(cacheKey);
    if (cached) return cached;
  }

  try {
    const fn = invokeBackendAction<
      { announcementId: string },
      { announcement: Record<string, unknown> }
    >('getAnnouncement', { timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({ announcementId });
    const announcement = normalizeAnnouncementRecord(result.announcement);
    setCachedContent(cacheKey, announcement);
    return announcement;
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    throw new Error('找不到這則公告。', { cause: error });
  }
}

export async function createAnnouncement(input: AnnouncementInput): Promise<AnnouncementRecord> {
  const fn = invokeBackendAction<AnnouncementInput & { requestId: string }, { announcement: Record<string, unknown> }>('createAnnouncement');
  const result = await fn({ ...input, requestId: createRequestId() });
  const announcement = normalizeAnnouncementRecord(result.announcement);
  markContentCachePrefixStale(ANNOUNCEMENT_LIST_CACHE_PREFIX);
  return announcement;
}

export async function deleteAnnouncement(announcementId: string) {
  const fn = invokeBackendAction<{ announcementId: string; requestId: string }, { success: boolean }>('deleteAnnouncement');
  const result = await fn({ announcementId, requestId: createRequestId() });
  markContentCachePrefixStale(ANNOUNCEMENT_LIST_CACHE_PREFIX);
  return result;
}

export async function setAnnouncementLike(announcementId: string, liked: boolean) {
  const fn = invokeBackendAction<
    { announcementId: string; liked: boolean; requestId: string },
    { liked: boolean; like_count: number }
  >('setAnnouncementLike');
  const result = await fn({ announcementId, liked, requestId: createRequestId() });
  return result;
}

export async function fetchAnnouncementComments(
  announcementId: string,
  cursor?: CommentCursor,
  options: { cacheScope?: string; forceRefresh?: boolean; signal?: AbortSignal | null } = {},
) {
  const cacheKey = createContentCacheKey([
    'announcement-comments-page',
    options.cacheScope ?? 'default',
    announcementId,
    cursor?.id ?? 'first',
    cursor?.createdAtMs ?? '',
  ]);
  if (!options.forceRefresh) {
    const cached = getCachedContent<{ comments: AnnouncementCommentRecord[]; cursor: CommentCursor; hasMore: boolean }>(cacheKey);
    if (cached) return cached;
  }

  const fn = invokeBackendAction<
    { announcementId: string; cursor?: CommentCursor; pageSize: number },
    { comments: Array<Record<string, unknown>>; cursor: CommentCursor; hasMore: boolean }
  >('listAnnouncementComments', {
    signal: 'signal' in options ? options.signal ?? undefined : undefined,
    timeoutMs: READ_REQUEST_TIMEOUT_MS,
  });
  const result = await fn({ announcementId, cursor, pageSize: COMMENT_FEED_PAGE_SIZE });
  const page = {
    comments: result.comments.map(normalizeAnnouncementComment),
    cursor: normalizeCommentCursor(result.cursor),
    hasMore: result.hasMore,
  } satisfies {
    comments: AnnouncementCommentRecord[];
    cursor: CommentCursor;
    hasMore: boolean;
  };
  setCachedContent(cacheKey, page);
  return page;
}

export async function createAnnouncementComment(announcementId: string, content: string, parentCommentId: string | null = null) {
  const fn = invokeBackendAction<
    { announcementId: string; content: string; parentCommentId?: string | null; requestId: string },
    { comment: Record<string, unknown>; comment_count: number }
  >('createAnnouncementComment');
  const result = await fn({ announcementId, content, parentCommentId, requestId: createRequestId() });
  markContentCachePrefixStale(ANNOUNCEMENT_COMMENTS_CACHE_PREFIX);
  return {
    comment: normalizeAnnouncementComment(result.comment),
    comment_count: result.comment_count,
  };
}

export async function deleteAnnouncementComment(commentId: string) {
  const fn = invokeBackendAction<
    { commentId: string; requestId: string },
    { success: boolean; announcement_id: string; comment_count: number }
  >('deleteAnnouncementComment');
  const result = await fn({ commentId, requestId: createRequestId() });
  markContentCachePrefixStale(ANNOUNCEMENT_COMMENTS_CACHE_PREFIX);
  return result;
}
