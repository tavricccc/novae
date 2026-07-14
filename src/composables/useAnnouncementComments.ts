import { useDiscussionComments } from '@/composables/useDiscussionComments';
import {
  createAnnouncementComment,
  deleteAnnouncementComment,
  fetchAnnouncementComments,
} from '@/services/announcements';
import type { AnnouncementCommentRecord } from '@/types';

export function useAnnouncementComments(
  announcementId: () => string | null,
  onCommentCountChanged?: (payload: { announcementId: string; commentCount: number }) => void,
  onContentUnavailable?: (announcementId: string) => void,
) {
  const core = useDiscussionComments<AnnouncementCommentRecord>({
    cacheNamespace: 'announcement-comments-state',
    channelPrefix: 'announcement-comments',
    realtimeEventType: 'announcement_comment_changed',
    abortMessage: '公告留言載入已取消。',
    loadErrorMessage: '公告留言載入失敗。',
    getTargetId: () => announcementId() ?? '',
    fetchPage: (targetId, cursor, options) => fetchAnnouncementComments(targetId, cursor ?? undefined, options),
    create: async (targetId, content, parentCommentId) => {
      const result = await createAnnouncementComment(targetId, content, parentCommentId);
      return { comment: result.comment, commentCount: result.comment_count };
    },
    remove: async (commentId) => {
      const result = await deleteAnnouncementComment(commentId);
      return {
        targetId: result.announcement_id,
        commentCount: result.comment_count,
      };
    },
    onCommentCountChanged: onCommentCountChanged
      ? ({ targetId, commentCount }) => onCommentCountChanged({ announcementId: targetId, commentCount })
      : undefined,
    onContentUnavailable,
  });

  return {
    canDeleteComment: core.canDeleteComment,
    comments: core.comments,
    deletingId: core.deletingId,
    error: core.error,
    loadComments: async (options: { force?: boolean } = {}) => {
      await core.loadComments(options);
    },
    loadMoreComments: core.loadMoreComments,
    loadMoreError: core.loadMoreError,
    hasMore: core.hasMore,
    loaded: core.loaded,
    loading: core.loading,
    loadingMore: core.loadingMore,
    submitComment: core.submitComment,
    submitting: core.isSubmitting,
    deleteComment: core.deleteCommentById,
    subscribeCurrentAnnouncementComments: core.subscribeCurrentComments,
  };
}
