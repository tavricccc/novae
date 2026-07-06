<template>
  <CommentThreadPanel
    :can-delete-comment="canDeleteThreadComment"
    :can-compose="canCompose"
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
    :on-delete-comment="deleteCommentById"
    :on-submit-comment="handleSubmitComment"
    :submit-error="submitError"
    :submitting="isSubmitting"
    :target-id="issueId"
  />
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import CommentThreadPanel from '@/components/CommentThreadPanel.vue';
import { useIssueComments } from '@/composables/useIssueComments';
import type { DiscussionCommentRecord } from '@/types';

const props = withDefaults(
  defineProps<{
    canCompose?: boolean;
    issueId: string;
    compactHeader?: boolean;
  }>(),
  {
    canCompose: true,
    compactHeader: false,
  },
);

const emit = defineEmits<{
  contentUnavailable: [issueId: string];
}>();

const {
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
} = useIssueComments(toRef(props, 'issueId'), (issueId) => emit('contentUnavailable', issueId));

async function handleSubmitComment(payload: { content: string; parentCommentId: string | null }) {
  return submitComment(payload.content, payload.parentCommentId);
}

function canDeleteThreadComment(comment: DiscussionCommentRecord) {
  return canDeleteComment(comment);
}
</script>
