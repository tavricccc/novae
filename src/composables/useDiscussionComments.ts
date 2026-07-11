import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';
import { registerAppResumeHandler } from '@/composables/useAppResume';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { formatRequestError, isAbortFailure, RequestFailure } from '@/lib/request';
import {
  createContentCacheKey,
  isContentCacheFresh,
  markContentRealtimeReliable,
  markContentRealtimeUnreliable,
  markContentWentOffline,
  shouldRefreshContentAfterResume,
} from '@/services/content-read-cache';
import { isContentUnavailableError } from '@/services/issues-core';
import { subscribeContentRealtimeEvents } from '@/services/realtime-events';
import type { DiscussionCommentRecord } from '@/types';

export interface DiscussionCommentsPage<TComment extends DiscussionCommentRecord> {
  comments: TComment[];
  cursor: { id: string; createdAtMs: number } | null;
  hasMore: boolean;
}

export interface DiscussionCommentsAdapters<TComment extends DiscussionCommentRecord> {
  cacheNamespace: string;
  channelPrefix: string;
  realtimeEventType: string;
  abortMessage: string;
  loadErrorMessage: string;
  getTargetId: () => string;
  fetchPage: (
    targetId: string,
    cursor: { id: string; createdAtMs: number } | null,
    options: { cacheScope: string; forceRefresh?: boolean; signal?: AbortSignal | null },
  ) => Promise<DiscussionCommentsPage<TComment>>;
  create: (
    targetId: string,
    content: string,
    parentCommentId: string | null,
  ) => Promise<{ comment: TComment; commentCount?: number }>;
  remove: (commentId: string) => Promise<{ targetId?: string; commentCount?: number } | void>;
  onCommentCountChanged?: (payload: { targetId: string; commentCount: number }) => void;
  onContentUnavailable?: (targetId: string) => void;
  /** When true, submit validates login + non-empty content into submitError. */
  validateSubmit?: boolean;
  deletedToast?: string;
}

interface CommentsSnapshot<TComment extends DiscussionCommentRecord> {
  comments: TComment[];
  cursor: { id: string; createdAtMs: number } | null;
  hasMore: boolean;
  loaded: boolean;
  updatedAt: number;
}

const caches = new Map<string, Map<string, CommentsSnapshot<DiscussionCommentRecord>>>();
const MAX_COMMENT_SNAPSHOTS_PER_NAMESPACE = 100;

function getNamespaceCache(namespace: string) {
  let cache = caches.get(namespace);
  if (!cache) {
    cache = new Map();
    caches.set(namespace, cache);
  }
  return cache as Map<string, CommentsSnapshot<DiscussionCommentRecord>>;
}

export function useDiscussionComments<TComment extends DiscussionCommentRecord>(
  adapters: DiscussionCommentsAdapters<TComment>,
  /** Optional external id ref/getter to auto-load + subscribe when it changes. */
  autoTarget?: MaybeRefOrGetter<string>,
) {
  const { isAdmin, user, roleLoading } = useSession();
  const { showProgressToast, showToast } = useToast();
  const { isOnline } = useNetworkStatus();

  const comments = ref<TComment[]>([]) as Ref<TComment[]>;
  const loading = ref(false);
  const loadingMore = ref(false);
  const hasMore = ref(false);
  const loaded = ref(false);
  const cursor = ref<{ id: string; createdAtMs: number } | null>(null);
  const error = ref('');
  const submitError = ref('');
  const isSubmitting = ref(false);
  const deletingId = ref('');

  let requestVersion = 0;
  let requestController: AbortController | null = null;
  let realtimeUnsubscribe: (() => void) | null = null;
  let realtimeRefreshTimer = 0;
  const ignoredRealtimeCommentIds = new Set<string>();
  const namespaceCache = getNamespaceCache(adapters.cacheNamespace);

  function targetId() {
    return adapters.getTargetId();
  }

  function cacheKey(id = targetId()) {
    return createContentCacheKey([
      adapters.cacheNamespace,
      user.value?.uid ?? '',
      isAdmin.value ? 'admin' : 'user',
      id,
    ]);
  }

  function serviceCacheScope() {
    return createContentCacheKey([
      user.value?.uid ?? '',
      isAdmin.value ? 'admin' : 'user',
    ]);
  }

  function saveSnapshot(id = targetId()) {
    if (!id) return;
    namespaceCache.set(cacheKey(id), {
      comments: comments.value,
      cursor: cursor.value,
      hasMore: hasMore.value,
      loaded: loaded.value,
      updatedAt: Date.now(),
    });
    if (namespaceCache.size <= MAX_COMMENT_SNAPSHOTS_PER_NAMESPACE) return;
    for (const [key, snapshot] of namespaceCache) {
      if (!isContentCacheFresh(snapshot.updatedAt)) namespaceCache.delete(key);
    }
    while (namespaceCache.size > MAX_COMMENT_SNAPSHOTS_PER_NAMESPACE) {
      const oldestKey = namespaceCache.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      namespaceCache.delete(oldestKey);
    }
  }

  function hydrateSnapshot(id = targetId()) {
    const cached = namespaceCache.get(cacheKey(id));
    if (!cached || !isContentCacheFresh(cached.updatedAt)) return false;
    comments.value = cached.comments as TComment[];
    cursor.value = cached.cursor;
    hasMore.value = cached.hasMore;
    loaded.value = cached.loaded;
    loading.value = false;
    error.value = '';
    return true;
  }

  function clearCommentState() {
    comments.value = [];
    cursor.value = null;
    hasMore.value = false;
    loaded.value = false;
  }

  function createRequestSignal() {
    requestController?.abort(new RequestFailure(adapters.abortMessage, 'aborted'));
    requestController = new AbortController();
    return requestController.signal;
  }

  function containsComment(commentItems: TComment[], commentId: string) {
    return commentItems.some((comment) =>
      comment.id === commentId || comment.replies.some((reply) => reply.id === commentId)
    );
  }

  function insertLocalComment(comment: TComment, parentCommentId: string | null) {
    if (!parentCommentId) {
      if (containsComment(comments.value, comment.id)) return true;
      comments.value = [...comments.value, { ...comment, replies: comment.replies ?? [] }];
      loaded.value = true;
      return true;
    }

    let inserted = false;
    comments.value = comments.value.map((item) => {
      if (item.id !== parentCommentId) return item;
      if (item.replies.some((reply) => reply.id === comment.id)) {
        inserted = true;
        return item;
      }
      inserted = true;
      return {
        ...item,
        replies: [...item.replies, { ...comment, parent_comment_id: parentCommentId, replies: [] }],
      };
    });
    return inserted;
  }

  function removeLocalComment(commentId: string) {
    let removed = false;
    const nextComments = comments.value
      .filter((comment) => {
        if (comment.id !== commentId) return true;
        removed = true;
        return false;
      })
      .map((comment) => {
        const replies = comment.replies.filter((reply) => {
          if (reply.id !== commentId) return true;
          removed = true;
          return false;
        });
        return replies.length === comment.replies.length ? comment : { ...comment, replies };
      });
    comments.value = nextComments;
    return removed;
  }

  async function loadComments(options: { force?: boolean; id?: string } = {}) {
    const id = options.id || targetId();
    if (!id) {
      requestVersion += 1;
      requestController?.abort(new RequestFailure(adapters.abortMessage, 'aborted'));
      clearCommentState();
      loading.value = false;
      error.value = '';
      return;
    }

    if (!options.force && hydrateSnapshot(id)) return;

    const currentVersion = ++requestVersion;
    loading.value = true;
    error.value = '';

    try {
      const page = await adapters.fetchPage(id, null, {
        cacheScope: serviceCacheScope(),
        forceRefresh: options.force === true,
        signal: createRequestSignal(),
      });
      if (currentVersion !== requestVersion) return;
      comments.value = page.comments;
      cursor.value = page.cursor;
      hasMore.value = page.hasMore;
      loaded.value = true;
      saveSnapshot(id);
      markContentRealtimeReliable();
    } catch (caught) {
      if (currentVersion === requestVersion && !isAbortFailure(caught)) {
        error.value = isOnline.value
          ? formatRequestError(caught, adapters.loadErrorMessage)
          : '目前已離線，請恢復網路連線後重新整理。';
        if (isContentUnavailableError(caught)) {
          adapters.onContentUnavailable?.(id);
        }
      }
    } finally {
      if (currentVersion === requestVersion) loading.value = false;
    }
  }

  async function reloadLoadedComments() {
    const id = targetId();
    if (!id || roleLoading.value) return;

    const currentVersion = ++requestVersion;
    loading.value = true;
    error.value = '';

    try {
      const page = await adapters.fetchPage(id, null, {
        cacheScope: serviceCacheScope(),
        forceRefresh: true,
        signal: createRequestSignal(),
      });
      if (currentVersion !== requestVersion) return;
      comments.value = page.comments;
      cursor.value = page.cursor;
      hasMore.value = page.hasMore;
      loaded.value = true;
      saveSnapshot(id);
    } catch (caught) {
      if (currentVersion === requestVersion && !isAbortFailure(caught)) {
        error.value = isOnline.value
          ? formatRequestError(caught, adapters.loadErrorMessage)
          : '目前已離線，請恢復網路連線後重新整理。';
      }
    } finally {
      if (currentVersion === requestVersion) loading.value = false;
    }
  }

  function scheduleRealtimeRefresh() {
    window.clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = window.setTimeout(() => {
      void loadComments({ force: true });
    }, 300);
  }

  function subscribeCurrentComments() {
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    window.clearTimeout(realtimeRefreshTimer);

    const id = targetId();
    if (!id) return;

    realtimeUnsubscribe = subscribeContentRealtimeEvents(`${adapters.channelPrefix}:${id}`, (event) => {
      if (event.eventType !== adapters.realtimeEventType) return;
      if (event.parentId !== id) return;
      if (ignoredRealtimeCommentIds.delete(event.targetId)) return;
      scheduleRealtimeRefresh();
    }, () => {
      markContentRealtimeUnreliable();
    });
  }

  async function loadMoreComments() {
    const id = targetId();
    if (!id || !hasMore.value || !cursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await adapters.fetchPage(id, cursor.value, {
        cacheScope: serviceCacheScope(),
        signal: null,
      });
      comments.value = [...comments.value, ...page.comments];
      cursor.value = page.cursor;
      hasMore.value = page.hasMore;
      saveSnapshot(id);
    } catch (caught) {
      if (!isAbortFailure(caught)) {
        if (isContentUnavailableError(caught)) {
          adapters.onContentUnavailable?.(id);
          return;
        }
        showToast(
          isOnline.value ? '無法載入更多留言。' : '目前已離線，請恢復網路連線後再試。',
          'error',
        );
      }
    } finally {
      loadingMore.value = false;
    }
  }

  function canDeleteComment(comment: DiscussionCommentRecord) {
    return isAdmin.value || comment.author_uid === user.value?.uid;
  }

  async function submitComment(content: string, parentCommentId: string | null = null) {
    const id = targetId();
    if (!id) return false;

    submitError.value = '';
    error.value = '';

    if (adapters.validateSubmit) {
      if (!user.value?.email || !user.value.displayName) {
        submitError.value = '請先使用完整的校內 Google 帳號登入。';
        showToast(submitError.value, 'error');
        return false;
      }
      if (content.trim().length === 0) {
        submitError.value = '留言內容不能空白。';
        showToast(submitError.value, 'error');
        return false;
      }
    }

    isSubmitting.value = true;
    const progressToast = showProgressToast(parentCommentId ? '正在送出回覆...' : '正在送出留言...');
    try {
      const result = await adapters.create(id, content, parentCommentId);
      ignoredRealtimeCommentIds.add(result.comment.id);
      if (!insertLocalComment(result.comment, parentCommentId)) {
        await reloadLoadedComments();
      } else {
        saveSnapshot(id);
      }
      if (typeof result.commentCount === 'number') {
        adapters.onCommentCountChanged?.({ targetId: id, commentCount: result.commentCount });
      }
      progressToast.succeed(parentCommentId ? '回覆已送出。' : '留言已送出。');
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '留言送出失敗。';
      if (adapters.validateSubmit) submitError.value = message;
      else error.value = message;
      progressToast.fail(message);
      if (isContentUnavailableError(caught)) {
        adapters.onContentUnavailable?.(id);
      }
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function deleteCommentById(commentId: string) {
    deletingId.value = commentId;
    submitError.value = '';
    error.value = '';
    const progressToast = showProgressToast('正在刪除留言...');
    try {
      const result = await adapters.remove(commentId);
      ignoredRealtimeCommentIds.add(commentId);
      const snapshotId = result?.targetId || targetId();
      if (!removeLocalComment(commentId)) {
        await reloadLoadedComments();
      } else if (snapshotId) {
        saveSnapshot(snapshotId);
      }
      if (result && typeof result.commentCount === 'number' && result.targetId) {
        adapters.onCommentCountChanged?.({
          targetId: result.targetId,
          commentCount: result.commentCount,
        });
      }
      progressToast.succeed(adapters.deletedToast ?? '留言已刪除。');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '留言刪除失敗。';
      if (adapters.validateSubmit) submitError.value = message;
      else error.value = message;
      progressToast.fail(message);
    } finally {
      deletingId.value = '';
    }
  }

  const unregisterResumeHandler = registerAppResumeHandler(() => {
    const id = targetId();
    if (!id) return;
    const cached = namespaceCache.get(cacheKey(id));
    if (shouldRefreshContentAfterResume(cached?.updatedAt ?? 0)) {
      void loadComments({ force: true, id });
    }
  });

  watch(isOnline, (online) => {
    if (!online) {
      markContentWentOffline();
      return;
    }
    const id = targetId();
    if (!id) return;
    const cached = namespaceCache.get(cacheKey(id));
    if (shouldRefreshContentAfterResume(cached?.updatedAt ?? 0)) {
      void loadComments({ force: true, id });
    }
  });

  if (autoTarget !== undefined) {
    watch(() => toValue(autoTarget), (id) => {
      clearCommentState();
      void loadComments({ id: id || undefined });
    }, { immediate: true });

    watch([() => toValue(autoTarget), roleLoading], ([id, waitingForRole]) => {
      realtimeUnsubscribe?.();
      realtimeUnsubscribe = null;
      window.clearTimeout(realtimeRefreshTimer);
      if (!id || waitingForRole) return;
      subscribeCurrentComments();
    }, { immediate: true });
  } else {
    watch(roleLoading, (waitingForRole) => {
      if (waitingForRole) {
        realtimeUnsubscribe?.();
        realtimeUnsubscribe = null;
        window.clearTimeout(realtimeRefreshTimer);
        return;
      }
      subscribeCurrentComments();
    });
  }

  onScopeDispose(() => {
    realtimeUnsubscribe?.();
    unregisterResumeHandler();
    window.clearTimeout(realtimeRefreshTimer);
    requestVersion += 1;
    requestController?.abort(new RequestFailure(adapters.abortMessage, 'aborted'));
  });

  return {
    canDeleteComment,
    comments,
    cursor,
    deleteCommentById,
    deletingId,
    error,
    hasMore,
    isSubmitting,
    loaded,
    loadComments,
    loadMoreComments,
    loading,
    loadingMore,
    submitComment,
    submitError,
    subscribeCurrentComments,
  };
}
