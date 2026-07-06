<template>
  <article
    class="group relative px-0 transition-colors"
    :class="[
      isReply ? 'py-2' : 'py-2.5',
      !isReply && hasReplies ? 'comment-with-replies' : '',
      !isReply && hasReplies && repliesExpanded ? 'comment-with-replies-expanded' : '',
    ]"
  >
    <div class="flex items-start gap-2.5">
      <div class="shrink-0 pt-0.5">
        <AuthorAvatar
          :author-uid="comment.author_uid"
          :photo-url="comment.author_photo_url"
          :name="comment.author_name"
          size="sm"
          :alt-text="`${comment.author_name} 的頭像`"
        />
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p class="max-w-full truncate text-[13px] font-bold leading-5 text-ink-900 dark:text-ink-100">
                {{ comment.author_name }}
              </p>
              <p class="text-xs leading-5 text-ink-500/80 dark:text-ink-400/80">
                {{ formatDate(comment.created_at) }}
              </p>
            </div>
            <div class="comment-content-compact mt-0.5 max-w-none text-sm leading-5 text-ink-800 dark:text-ink-200">
              <MarkdownMediaContent :content="comment.content" :fallback-alt="`${comment.author_name} 的留言圖片`" />
            </div>
          </div>
          <CompactActionMenu
            v-if="canDelete"
            class="shrink-0 self-start opacity-80 transition-opacity group-hover:opacity-100"
            :delete-disabled="deleting"
            :delete-label="deleting ? '刪除中...' : '刪除留言'"
            :show-edit="false"
            title="管理留言"
            @delete="emit('delete')"
          />
        </div>

        <div v-if="!isReply" class="mt-1 flex flex-wrap items-center gap-1.5">
          <button
            v-if="canReply"
            type="button"
            class="button-toolbar h-7 rounded-full px-2.5 text-xs font-semibold"
            @click="emit('reply')"
          >
            回覆
          </button>

          <button
            v-if="hasReplies"
            type="button"
            class="reply-toggle relative inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-brand-700 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 dark:text-brand-300 dark:hover:bg-brand-900/30"
            :aria-expanded="repliesExpanded"
            @click="repliesExpanded = !repliesExpanded"
          >
            <AppIcon
              name="chevron-right"
              :size="3"
              :stroke-width="2.4"
              class="transition-transform"
              :class="{ 'rotate-90': repliesExpanded }"
            />
            {{ repliesToggleLabel }}
          </button>
        </div>

        <div
          v-if="!isReply && hasReplies && repliesExpanded"
          class="reply-list relative mt-1 pl-4"
        >
          <CommentItem
            v-for="reply in comment.replies"
            :key="reply.id"
            :comment="reply"
            :can-delete="canDeleteReply ? canDeleteReply(reply) : false"
            :can-reply="false"
            :deleting="deletingId === reply.id"
            :deleting-id="deletingId"
            is-reply
            @delete="emit('delete-reply', reply.id)"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AuthorAvatar from '@/components/AuthorAvatar.vue';
import CompactActionMenu from '@/components/CompactActionMenu.vue';
import MarkdownMediaContent from '@/components/MarkdownMediaContent.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { formatDate } from '@/lib/format';
import type { DiscussionCommentRecord } from '@/types';

const props = defineProps<{
  canDelete: boolean;
  canDeleteReply?: (comment: DiscussionCommentRecord) => boolean;
  canReply?: boolean;
  comment: DiscussionCommentRecord;
  deleting: boolean;
  deletingId?: string;
  isReply?: boolean;
}>();

const emit = defineEmits<{
  delete: [];
  'delete-reply': [commentId: string];
  reply: [];
}>();

const repliesExpanded = ref(false);
const hasReplies = computed(() => !props.isReply && props.comment.replies.length > 0);
const repliesToggleLabel = computed(() => (
  repliesExpanded.value ? '隱藏回覆' : `${props.comment.replies.length} 則回覆`
));
</script>

<style scoped>
.comment-content-compact :deep(.prose) {
  font-size: 0.875rem;
  line-height: 1.45;
}

.comment-content-compact :deep(.prose p) {
  margin-top: 0.125rem;
  margin-bottom: 0.125rem;
  line-height: 1.45;
}

.comment-content-compact :deep(.prose ul),
.comment-content-compact :deep(.prose ol) {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.comment-content-compact :deep(.prose li) {
  margin-top: 0.125rem;
  margin-bottom: 0.125rem;
}

.comment-content-compact :deep(.prose blockquote),
.comment-content-compact :deep(.prose pre),
.comment-content-compact :deep(.prose img) {
  margin-top: 0.375rem;
  margin-bottom: 0.375rem;
}

.comment-with-replies::before {
  position: absolute;
  top: 2.375rem;
  bottom: 1.25rem;
  left: 0.875rem;
  width: 1.25rem;
  border-bottom: 1px solid rgb(226 232 240);
  border-left: 1px solid rgb(226 232 240);
  border-bottom-left-radius: 1rem;
  content: '';
  pointer-events: none;
}

.comment-with-replies-expanded::before {
  bottom: 2rem;
}

.reply-toggle {
  margin-left: 1.25rem;
}

.reply-list::before {
  position: absolute;
  top: 0.875rem;
  left: -1.75rem;
  width: 1.75rem;
  height: 1rem;
  border-bottom: 1px solid rgb(226 232 240);
  border-left: 1px solid rgb(226 232 240);
  border-bottom-left-radius: 1rem;
  content: '';
  pointer-events: none;
}

:global(.dark) .comment-with-replies::before,
:global(.dark) .reply-list::before {
  border-color: rgb(30 41 59);
}
</style>
