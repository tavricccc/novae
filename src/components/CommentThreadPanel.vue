<template>
  <section class="relative flex h-full min-h-0 flex-col">
    <div
      class="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100 pb-2 dark:border-ink-800"
      :class="{ 'max-md:hidden': compactHeader }"
    >
      <div class="flex min-w-0 items-center gap-2">
        <AppIcon name="comment" class="shrink-0 text-ink-500" />
        <h4 class="truncate whitespace-nowrap text-base font-semibold text-ink-900 dark:text-ink-100">
          討論留言
        </h4>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <span class="tag rounded-full border-none bg-ink-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-ink-800/80">
          {{ comments.length }} 則
        </span>
        <button
          type="button"
          class="button-toolbar h-8 w-8 rounded-full p-0"
          :disabled="loading || loadingMore"
          aria-label="重新整理留言"
          title="重新整理留言"
          @click="onRefresh"
        >
          <LoadingSpinner v-if="loading" :size="4" />
          <AppIcon v-else name="refresh" />
        </button>
      </div>
    </div>

    <div
      v-if="compactHeader"
      class="hidden shrink-0 items-center justify-between gap-3 border-b border-ink-100 pb-2 dark:border-ink-800 max-md:flex"
    >
      <span class="tag rounded-full border-none bg-ink-100 px-2.5 py-0.5 text-xs font-semibold dark:bg-ink-800/80">
        {{ comments.length }} 則留言
      </span>
      <button
        type="button"
        class="button-toolbar h-8 w-8 rounded-full p-0"
        :disabled="loading || loadingMore"
        aria-label="重新整理留言"
        title="重新整理留言"
        @click="onRefresh"
      >
        <LoadingSpinner v-if="loading" :size="4" />
        <AppIcon v-else name="refresh" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto py-2 pr-1">
      <SkeletonCommentList v-if="visibleLoading" />

      <EmptyStatePanel
        v-else-if="error"
        title="留言載入失敗"
        :description="error"
        icon="warning"
        tone="danger"
        action-label="重新整理"
        @action="onRefresh"
      />

      <EmptyStatePanel
        v-else-if="loaded && comments.length === 0"
        title="目前尚無留言"
        description="第一則留言會出現在這裡。"
        icon="comment"
      />

      <div v-else class="space-y-0.5">
        <CommentItem
          v-for="comment in comments"
          :key="comment.id"
          :comment="comment"
          :can-delete="canDeleteComment(comment)"
          :can-delete-reply="canDeleteComment"
          :can-reply="canCompose"
          :deleting="deletingId === comment.id"
          :deleting-id="deletingId"
          @delete="requestDeleteComment(comment.id)"
          @delete-reply="requestDeleteComment"
          @reply="openReplyComposer(comment.id)"
        />
        <SkeletonCommentList v-if="loadingMore" class="mt-2" :count="2" />
        <div v-if="hasMore" ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
      </div>
    </div>

    <div class="shrink-0 border-t border-ink-200 bg-transparent pt-2 dark:border-ink-800/80">
      <button
        v-if="!isComposerOpen"
        type="button"
        class="button-primary w-full gap-2"
        :disabled="!canCompose"
        @click="isComposerOpen = true"
      >
        <AppIcon name="edit" class="shrink-0" />
        {{ canCompose ? '留言' : disabledComposerLabel }}
      </button>

      <CommentComposer
        v-else
        :target-id="targetId"
        :parent-comment-id="replyingToCommentId || null"
        :submitting="submitting"
        :error="submitError"
        @close="closeComposer"
        @submit="handleSubmitComment"
      />
    </div>

    <ConfirmDialog
      :open="Boolean(commentPendingDelete)"
      title="確定要刪除這則留言嗎？"
      message="刪除後這則留言將無法復原。"
      confirm-label="確認刪除"
      busy-label="刪除中..."
      :busy="Boolean(commentPendingDelete) && deletingId === commentPendingDelete"
      @cancel="closeDeleteDialog"
      @confirm="confirmDeleteComment"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import CommentComposer from '@/components/CommentComposer.vue';
import CommentItem from '@/components/CommentItem.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import SkeletonCommentList from '@/components/ui/SkeletonCommentList.vue';
import { useMinimumLoading } from '@/composables/useMinimumLoading';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import type { DiscussionCommentRecord } from '@/types';

const props = withDefaults(defineProps<{
  canDeleteComment: (comment: DiscussionCommentRecord) => boolean;
  canCompose?: boolean;
  comments: DiscussionCommentRecord[];
  compactHeader?: boolean;
  deletingId: string;
  error: string;
  loaded: boolean;
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  submitError: string;
  submitting: boolean;
  targetId: string;
  onDeleteComment: (commentId: string) => Promise<void>;
  onLoadMore?: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onSubmitComment: (payload: { content: string; parentCommentId: string | null }) => Promise<boolean>;
  disabledComposerLabel?: string;
}>(), {
  canCompose: true,
  compactHeader: false,
  disabledComposerLabel: '目前不開放留言',
  hasMore: false,
  loadingMore: false,
  onLoadMore: async () => undefined,
});

const isComposerOpen = ref(false);
const replyingToCommentId = ref('');
const commentPendingDelete = ref('');
const { visibleLoading } = useMinimumLoading(toRef(props, 'loading'));
const infiniteScrollDisabled = computed(() => props.loading || props.loadingMore || !props.hasMore);
const { sentinel: loadMoreSentinel } = useInfiniteScroll({
  disabled: infiniteScrollDisabled,
  onLoadMore: props.onLoadMore,
  rootMargin: '240px 0px',
});

function requestDeleteComment(commentId: string) {
  commentPendingDelete.value = commentId;
}

function closeDeleteDialog() {
  if (props.deletingId) {
    return;
  }

  commentPendingDelete.value = '';
}

async function confirmDeleteComment() {
  if (!commentPendingDelete.value) {
    return;
  }

  await props.onDeleteComment(commentPendingDelete.value);
  commentPendingDelete.value = '';
}

function closeComposer() {
  if (props.submitting) {
    return;
  }

  isComposerOpen.value = false;
  replyingToCommentId.value = '';
}

function openReplyComposer(commentId: string) {
  if (!props.canCompose) return;
  replyingToCommentId.value = commentId;
  isComposerOpen.value = true;
}

async function handleSubmitComment(payload: { content: string; parentCommentId: string | null }) {
  if (!props.canCompose) return false;
  const success = await props.onSubmitComment(payload);
  if (success) {
    isComposerOpen.value = false;
    replyingToCommentId.value = '';
  }
}
</script>
