<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="shrink-0 pb-1" :class="compact ? 'space-y-2' : 'space-y-4'">
      <h2
        class="break-words font-bold tracking-tight text-ink-900 dark:text-ink-50"
        :class="compact ? 'text-xl leading-snug' : 'text-xl leading-snug sm:text-2xl'"
      >
        {{ issue.title }}
      </h2>

      <div
        v-if="showAuthor"
        class="flex items-center border-b border-ink-100 text-sm dark:border-ink-800"
        :class="compact ? 'flex-wrap gap-2 pb-2' : 'gap-3 pb-3'"
      >
        <UserAvatar
          :photo-url="displayPhotoUrl"
          :name="displayAuthorName"
          :size="compact ? 'sm' : 'md'"
          :alt-text="`${displayAuthorName} 的頭像`"
        />

        <template v-if="compact">
          <p class="text-sm font-semibold text-ink-900 dark:text-ink-100">
            {{ displayAuthorName }}
          </p>
          <span class="text-ink-300 dark:text-ink-700">&middot;</span>
          <p class="text-xs font-normal text-ink-500/80 dark:text-ink-400/80">
            {{ primaryTimeShortText }}
          </p>
        </template>

        <div v-else class="min-w-0">
          <p class="text-sm font-semibold text-ink-900 dark:text-ink-100">
            {{ displayAuthorName }}
          </p>
          <p class="text-xs font-normal text-ink-500/80 dark:text-ink-400/80">
            {{ primaryTimeLabel }} {{ primaryTimeValueLabel }}
          </p>
        </div>
      </div>
    </div>

    <div
      class="min-h-0 py-2"
      :class="scrollContent ? 'my-2 flex-1 overflow-y-auto pr-2' : ''"
    >
      <div
        v-if="issue.status === 'review-rejected' && issue.review_rejection_reason"
        class="mb-4 rounded-xl border border-warning/25 bg-warning-container/50 px-4 py-3 text-sm text-on-warning-container"
      >
        <p class="font-semibold">審核未通過原因</p>
        <p class="mt-1 leading-6">{{ issue.review_rejection_reason }}</p>
      </div>
      <div
        v-else-if="issue.result_content"
        class="mb-4 rounded-xl border border-primary/25 bg-primary-container/50 px-4 py-3 text-sm text-on-primary-container"
      >
        <p class="font-semibold">提案結果</p>
        <div class="mt-1 leading-6">
          <MarkdownMediaContent :content="issue.result_content" :fallback-alt="`${issue.title} 的提案結果圖片`" />
        </div>
      </div>
      <MarkdownMediaContent :content="issue.content" :fallback-alt="issue.title" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownMediaContent from '@/components/MarkdownMediaContent.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import type { IssueRecord } from '@/types';

const props = defineProps<{
  compact?: boolean;
  displayAuthorName: string;
  displayPhotoUrl: string | null;
  issue: IssueRecord;
  primaryTimeLabel: string;
  primaryTimeValueLabel: string;
  scrollContent?: boolean;
  showAuthor: boolean;
}>();

const primaryTimeShortText = computed(() => `${props.primaryTimeLabel} ${props.primaryTimeValueLabel}`);
</script>
