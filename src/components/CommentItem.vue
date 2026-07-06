<template>
  <article
    class="group relative border-b px-0 py-4 transition-colors"
    :class="isReply ? 'border-ink-100 py-3 dark:border-ink-800/70' : 'border-ink-200 dark:border-ink-800'"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <AuthorAvatar
          :author-uid="comment.author_uid"
          :photo-url="comment.author_photo_url"
          :name="comment.author_name"
          size="md"
          :alt-text="`${comment.author_name} 的頭像`"
        />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-bold text-ink-800 dark:text-ink-200">{{ comment.author_name }}</p>
          </div>
          <p class="mt-0.5 text-xs font-normal text-ink-500/80 dark:text-ink-400/80">
            {{ formatDate(comment.created_at) }}
          </p>
        </div>
      </div>
      <CompactActionMenu
        v-if="canDelete"
        class="shrink-0 self-start"
        :delete-disabled="deleting"
        :delete-label="deleting ? '刪除中...' : '刪除留言'"
        :show-edit="false"
        title="管理留言"
        @delete="emit('delete')"
      />
    </div>

    <div class="mt-2.5 max-w-none">
      <MarkdownMediaContent :content="comment.content" :fallback-alt="`${comment.author_name} 的留言圖片`" />
    </div>

    <div v-if="!isReply && canReply" class="mt-2">
      <button
        type="button"
        class="button-toolbar h-8 rounded-full px-3 text-xs font-semibold"
        @click="emit('reply')"
      >
        回覆
      </button>
    </div>

    <div v-if="!isReply && comment.replies.length" class="mt-3 border-l border-ink-200 pl-4 dark:border-ink-800">
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
  </article>
</template>

<script setup lang="ts">
import AuthorAvatar from '@/components/AuthorAvatar.vue';
import CompactActionMenu from '@/components/CompactActionMenu.vue';
import MarkdownMediaContent from '@/components/MarkdownMediaContent.vue';
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
</script>
