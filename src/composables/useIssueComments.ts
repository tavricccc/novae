import { type Ref } from 'vue';
import { useDiscussionComments } from '@/composables/useDiscussionComments';
import { createComment, deleteComment, fetchComments } from '@/services/issues';
import type { CommentRecord } from '@/types';

export function useIssueComments(issueId: Ref<string>, onContentUnavailable?: (issueId: string) => void) {
  const core = useDiscussionComments<CommentRecord>(
    {
      cacheNamespace: 'issue-comments-state',
      channelPrefix: 'issue-comments',
      realtimeEventType: 'issue_comment_changed',
      abortMessage: '留言載入已取消。',
      loadErrorMessage: '留言載入失敗，請稍後再試。',
      getTargetId: () => issueId.value,
      fetchPage: (targetId, cursor, options) => fetchComments(targetId, cursor, options),
      create: async (targetId, content, parentCommentId) => {
        const comment = await createComment(targetId, { content }, parentCommentId);
        return { comment };
      },
      remove: async (commentId) => {
        await deleteComment(commentId);
      },
      onContentUnavailable,
      validateSubmit: true,
    },
    issueId,
  );

  return {
    canDeleteComment: core.canDeleteComment,
    comments: core.comments,
    deleteCommentById: core.deleteCommentById,
    deletingId: core.deletingId,
    error: core.error,
    isSubmitting: core.isSubmitting,
    hasMore: core.hasMore,
    loaded: core.loaded,
    loadMoreComments: core.loadMoreComments,
    loadMoreError: core.loadMoreError,
    loadComments: async (issueIdValue?: string | unknown, options: { force?: boolean } = {}) => {
      const finalId = typeof issueIdValue === 'string' && issueIdValue ? issueIdValue : issueId.value;
      await core.loadComments({ ...options, id: finalId || undefined });
    },
    loading: core.loading,
    loadingMore: core.loadingMore,
    submitComment: core.submitComment,
    submitError: core.submitError,
  };
}
