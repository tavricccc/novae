import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { createComment, deleteComment, fetchComments } from '@/services/issues';
import type { CommentRecord, DiscussionCommentRecord } from '@/types';
import { formatRequestError, isAbortFailure, RequestFailure } from '@/lib/request';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { isContentUnavailableError } from '@/services/issues-core';

export function useIssueComments(issueId: Ref<string>, onContentUnavailable?: (issueId: string) => void) {
  const { isAdmin, user } = useSession();
  const { showToast } = useToast();
  const { isOnline } = useNetworkStatus();

  const comments = ref<CommentRecord[]>([]);
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

  function clearCommentState() {
    comments.value = [];
    cursor.value = null;
    hasMore.value = false;
    loaded.value = false;
  }

  function createRequestSignal() {
    requestController?.abort(new RequestFailure('留言載入已取消。', 'aborted'));
    requestController = new AbortController();
    return requestController.signal;
  }

  async function loadComments(issueIdValue?: string | unknown) {
    const finalId = typeof issueIdValue === 'string' && issueIdValue ? issueIdValue : issueId.value;
    if (!finalId) {
      requestVersion += 1;
      requestController?.abort(new RequestFailure('留言載入已取消。', 'aborted'));
      clearCommentState();
      loading.value = false;
      error.value = '';
      return;
    }

    const currentVersion = ++requestVersion;
    loading.value = true;
    error.value = '';

    try {
      const page = await fetchComments(finalId, null, {
        signal: createRequestSignal(),
      });
      if (currentVersion !== requestVersion) return;
      comments.value = page.comments;
      cursor.value = page.cursor;
      hasMore.value = page.hasMore;
      loaded.value = true;
    } catch (caught) {
      if (currentVersion === requestVersion && !isAbortFailure(caught)) {
        error.value = isOnline.value
          ? formatRequestError(caught, '留言載入失敗，請稍後再試。')
          : '目前已離線，請恢復網路連線後重新整理。';
        if (isContentUnavailableError(caught)) {
          onContentUnavailable?.(finalId);
        }
      }
    } finally {
      if (currentVersion === requestVersion) loading.value = false;
    }
  }

  watch(issueId, (issueIdValue) => {
    clearCommentState();
    void loadComments(issueIdValue);
  }, { immediate: true });

  onScopeDispose(() => {
    requestVersion += 1;
    requestController?.abort(new RequestFailure('留言載入已取消。', 'aborted'));
  });

  async function loadMoreComments() {
    if (!hasMore.value || !cursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await fetchComments(issueId.value, cursor.value, { signal: null });
      comments.value = [...comments.value, ...page.comments];
      cursor.value = page.cursor;
      hasMore.value = page.hasMore;
    } catch (caught) {
      if (!isAbortFailure(caught)) {
        if (isContentUnavailableError(caught)) {
          onContentUnavailable?.(issueId.value);
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
    return comment.author_uid === user.value?.uid || isAdmin.value;
  }

  async function submitComment(content: string, parentCommentId: string | null = null) {
    submitError.value = '';

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

    isSubmitting.value = true;

    try {
      const comment = await createComment(
        issueId.value,
        { content },
        parentCommentId,
      );
      if (parentCommentId) {
        comments.value = comments.value.map((entry) =>
          entry.id === parentCommentId
            ? {
              ...entry,
              replies: [...entry.replies, comment].sort((left, right) =>
                (left.created_at?.getTime() ?? 0) - (right.created_at?.getTime() ?? 0)
              ),
            }
            : entry
        );
      } else {
        const commentMap = new Map(comments.value.map((entry) => [entry.id, entry]));
        commentMap.set(comment.id, comment);
        comments.value = Array.from(commentMap.values()).sort((left, right) =>
          (left.created_at?.getTime() ?? 0) - (right.created_at?.getTime() ?? 0)
        );
      }
      loaded.value = true;

      return true;
    } catch (caught) {
      submitError.value = caught instanceof Error ? caught.message : '送出失敗，請稍後再試。';
      showToast(submitError.value, 'error');
      if (isContentUnavailableError(caught)) {
        onContentUnavailable?.(issueId.value);
      }
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  async function deleteCommentById(commentId: string) {
    deletingId.value = commentId;
    submitError.value = '';

    try {
      await deleteComment(commentId);
      comments.value = comments.value
        .filter((comment) => comment.id !== commentId)
        .map((comment) => ({
          ...comment,
          replies: comment.replies.filter((reply) => reply.id !== commentId),
        }));
    } catch {
      submitError.value = '刪除失敗，請稍後再試。';
      showToast(submitError.value, 'error');
    } finally {
      deletingId.value = '';
    }
  }

  return {
    canDeleteComment,
    comments,
    deleteCommentById,
    deletingId,
    error,
    isSubmitting,
    hasMore,
    loaded,
    loadMoreComments,
    loadComments,
    loading,
    loadingMore,
    submitComment,
    submitError,
  };
}
