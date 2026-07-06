<template>
  <CommentThreadPanel
    :can-delete-comment="canDeleteThreadComment"
    :comments="comments"
    :compact-header="compactHeader"
    :deleting-id="deletingId"
    :error="error"
    :loaded="loaded"
    :loading="loading"
    :has-more="hasMore"
    :loading-more="loadingMore"
    :on-load-more="loadMoreComments"
    :on-refresh="loadComments"
    :on-delete-comment="deleteComment"
    :on-submit-comment="handleSubmit"
    :submit-error="error"
    :submitting="submitting"
    :target-id="announcementId"
  />
</template>

<script setup lang="ts">
import { watch } from 'vue';
import CommentThreadPanel from '@/components/CommentThreadPanel.vue';
import { useAnnouncementComments } from '@/composables/useAnnouncementComments';
import type { DiscussionCommentRecord } from '@/types';

const props = withDefaults(defineProps<{
  announcementId: string;
  compactHeader?: boolean;
}>(), {
  compactHeader: false,
});

const emit = defineEmits<{
  commentCountChanged: [payload: { announcementId: string; commentCount: number }];
  contentUnavailable: [announcementId: string];
}>();

const {
  canDeleteComment,
  comments,
  deletingId,
  error,
  loadComments,
  loadMoreComments,
  hasMore,
  loaded,
  loading,
  loadingMore,
  submitComment,
  submitting,
  deleteComment,
} = useAnnouncementComments(
  () => props.announcementId,
  (payload) => emit('commentCountChanged', payload),
  (announcementId) => emit('contentUnavailable', announcementId),
);

async function handleSubmit(payload: { content: string; parentCommentId: string | null }) {
  return submitComment(payload.content, payload.parentCommentId);
}

function canDeleteThreadComment(comment: DiscussionCommentRecord) {
  return canDeleteComment(comment);
}

watch(
  () => props.announcementId,
  () => {
    void loadComments();
  },
  { immediate: true },
);

</script>
