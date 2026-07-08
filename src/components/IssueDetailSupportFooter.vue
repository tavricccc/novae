<template>
  <div class="mt-auto shrink-0 border-t border-ink-100 pb-1 dark:border-ink-800" :class="compact ? 'space-y-3 px-1 pt-3' : 'space-y-3 pt-3'">
    <div v-if="issue.support_enabled" class="space-y-3">
      <div class="space-y-2">
        <div class="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
          <span class="text-sm font-bold text-ink-900 dark:text-ink-50">
            附議進度 {{ supportCount }} / {{ issue.support_goal ?? 0 }}
          </span>
          <span v-if="supportRemainingLabel" class="whitespace-nowrap text-xs font-bold text-ink-500 dark:text-ink-400">
            ({{ supportRemainingLabel }})
          </span>
        </div>
        <div class="relative h-2 w-full overflow-hidden rounded-full bg-ink-200/50 dark:bg-ink-800/80">
          <div
            class="h-full rounded-full bg-ink-900 transition-all duration-500 dark:bg-ink-100"
            :style="supportProgressStyle"
          ></div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <VoteButtons
          class="shrink-0"
          :issue-id="issue.id"
          :current-user-supported="currentUserSupported"
          :support-count="supportCount"
          :support-closed="supportClosed"
          :status-label="statusLabel"
          :compact="compact"
          @content-unavailable="emit('contentUnavailable', $event)"
          @supported="emit('supported', $event)"
        />
        <DetailActionButton
          label="分享"
          :compact="compact"
          title="複製分享連結"
          aria-label="複製分享連結"
          @click="emit('share')"
        >
          <ShareIcon :size="4" />
        </DetailActionButton>
        <DetailActionButton
          v-if="isAdmin && !isClosed"
          :label="isUnderReview ? '審核提案' : '變更提案狀態/結果'"
          :compact="compact"
          :title="isUnderReview ? '審核提案' : '變更提案狀態/結果'"
          :aria-label="isUnderReview ? '審核提案' : '變更提案狀態/結果'"
          @click="isUnderReview ? emit('moderate') : emit('edit-result')"
        >
          <AppIcon name="edit" />
        </DetailActionButton>
        <DetailActionButton
          v-if="canManage"
          danger
          label="刪除"
          :compact="compact"
          title="刪除提案"
          aria-label="刪除提案"
          @click="emit('delete')"
        >
          <TrashIcon :size="4" />
        </DetailActionButton>
      </div>
    </div>
    <div v-else class="flex flex-wrap justify-start gap-2">
      <DetailActionButton
        label="分享"
        :compact="compact"
        title="複製分享連結"
        aria-label="複製分享連結"
        @click="emit('share')"
      >
        <ShareIcon :size="4" />
      </DetailActionButton>
      <DetailActionButton
        v-if="isAdmin && !isClosed"
        :label="isUnderReview ? '審核提案' : '變更提案狀態/結果'"
        :compact="compact"
        :title="isUnderReview ? '審核提案' : '變更提案狀態/結果'"
        :aria-label="isUnderReview ? '審核提案' : '變更提案狀態/結果'"
        @click="isUnderReview ? emit('moderate') : emit('edit-result')"
      >
        <AppIcon name="edit" />
      </DetailActionButton>
      <DetailActionButton
        v-if="canManage"
        danger
        label="刪除"
        :compact="compact"
        title="刪除提案"
        aria-label="刪除提案"
        @click="emit('delete')"
      >
        <TrashIcon :size="4" />
      </DetailActionButton>
    </div>

    <div
      class="flex flex-wrap text-xs text-ink-500 dark:text-ink-400"
      :class="[
        compact ? 'gap-x-3 gap-y-1' : 'gap-x-4 gap-y-2',
        issue.support_enabled ? (compact ? 'mt-2 border-t border-ink-100 pt-2 dark:border-ink-800' : 'mt-3 border-t border-ink-100 pt-3 dark:border-ink-800') : ''
      ]"
    >
      <div
        v-for="item in operationTimeItems"
        :key="item.label"
        class="flex items-center gap-1"
        :class="{ 'shrink-0': compact }"
      >
        <span class="font-semibold text-ink-400">{{ compact ? `${item.shortLabel}：` : `${item.label}：` }}</span>
        <span class="font-medium text-ink-700 dark:text-ink-300">{{ item.valueLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import DetailActionButton from '@/components/ui/DetailActionButton.vue';
import ShareIcon from '@/components/ui/ShareIcon.vue';
import TrashIcon from '@/components/ui/TrashIcon.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import VoteButtons from '@/components/VoteButtons.vue';
import type { IssueOperationTimeItem, IssueRecord } from '@/types';

const props = defineProps<{
  canManage?: boolean;
  isAdmin?: boolean;
  compact?: boolean;
  currentUserSupported: boolean;
  issue: IssueRecord;
  operationTimeItems: IssueOperationTimeItem[];
  statusLabel: string;
  supportClosed: boolean;
  supportCount: number;
  supportProgressStyle: CSSProperties;
  supportRemainingLabel: string;
}>();

const emit = defineEmits<{
  contentUnavailable: [issueId: string];
  delete: [];
  share: [];
  supported: [payload: { supported: boolean; supportCount: number }];
  'edit-result': [];
  moderate: [];
}>();

const isUnderReview = computed(() => props.issue.status === 'under-review');
const isClosed = computed(() =>
  props.issue.status === 'completed' ||
  props.issue.status === 'infeasible' ||
  props.issue.status === 'review-rejected' ||
  props.issue.status === 'auto-rejected'
);
</script>
