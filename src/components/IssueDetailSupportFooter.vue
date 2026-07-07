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
          :class="compact ? '!h-8 !gap-1 !px-2.5 text-xs' : ''"
          title="複製分享連結"
          aria-label="複製分享連結"
          @click="emit('share')"
        >
          <ShareIcon :size="4" />
        </DetailActionButton>
        <DetailActionButton
          v-if="isAdmin"
          :label="issue.result_content ? '編輯提案結果' : '新增提案結果'"
          :class="compact ? '!h-8 !gap-1 !px-2.5 text-xs' : ''"
          title="編輯提案結果"
          aria-label="編輯提案結果"
          @click="emit('edit-result')"
        >
          <AppIcon name="edit" />
        </DetailActionButton>
        <DetailActionButton
          v-if="canManage"
          danger
          label="刪除"
          :class="compact ? '!h-8 !gap-1 !px-2.5 text-xs' : ''"
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
        :class="compact ? '!h-8 !gap-1 !px-2.5 text-xs' : ''"
        title="複製分享連結"
        aria-label="複製分享連結"
        @click="emit('share')"
      >
        <ShareIcon :size="4" />
      </DetailActionButton>
      <DetailActionButton
        v-if="isAdmin"
        :label="issue.result_content ? '編輯提案結果' : '新增提案結果'"
        :class="compact ? '!h-8 !gap-1 !px-2.5 text-xs' : ''"
        title="編輯提案結果"
        aria-label="編輯提案結果"
        @click="emit('edit-result')"
      >
        <AppIcon name="edit" />
      </DetailActionButton>
      <DetailActionButton
        v-if="canManage"
        danger
        label="刪除"
        :class="compact ? '!h-8 !gap-1 !px-2.5 text-xs' : ''"
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
      <div class="flex items-center gap-1" :class="{ 'shrink-0': compact }">
        <span class="font-semibold text-ink-400">{{ compact ? `${primaryTimeShortLabel}：` : `${primaryTimeLabel}：` }}</span>
        <span class="font-medium text-ink-700 dark:text-ink-300">{{ primaryTimeValueLabel || (compact ? '未定' : '未設定') }}</span>
      </div>
      <div v-if="issue.support_enabled && issue.support_deadline_at" class="flex items-center gap-1" :class="{ 'shrink-0': compact, 'sm:justify-end': !compact }">
        <span class="font-semibold text-ink-400">{{ compact ? '截止：' : '附議截止：' }}</span>
        <span class="font-medium text-ink-700 dark:text-ink-300">{{ supportDeadlineLabel }}</span>
      </div>
      <div v-if="issue.response_deadline_at" class="flex items-center gap-1" :class="{ 'shrink-0': compact }">
        <span class="font-semibold text-ink-400">{{ compact ? '回覆：' : '回覆期限：' }}</span>
        <span class="font-medium text-ink-700 dark:text-ink-300">{{ responseDeadlineLabel }}</span>
      </div>
      <div v-if="!compact && issue.support_met_at" class="flex items-center gap-1.5 sm:justify-end">
        <span class="font-semibold text-ink-400">達標時間：</span>
        <span class="font-medium text-ink-700 dark:text-ink-300">{{ supportMetLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import DetailActionButton from '@/components/ui/DetailActionButton.vue';
import ShareIcon from '@/components/ui/ShareIcon.vue';
import TrashIcon from '@/components/ui/TrashIcon.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import VoteButtons from '@/components/VoteButtons.vue';
import type { IssueRecord } from '@/types';

defineProps<{
  canManage?: boolean;
  isAdmin?: boolean;
  compact?: boolean;
  currentUserSupported: boolean;
  issue: IssueRecord;
  primaryTimeLabel: string;
  primaryTimeShortLabel: string;
  primaryTimeValueLabel: string;
  responseDeadlineLabel: string;
  statusLabel: string;
  supportClosed: boolean;
  supportCount: number;
  supportDeadlineLabel: string;
  supportMetLabel: string;
  supportProgressStyle: CSSProperties;
  supportRemainingLabel: string;
}>();

const emit = defineEmits<{
  contentUnavailable: [issueId: string];
  delete: [];
  share: [];
  supported: [payload: { supported: boolean; supportCount: number }];
  'edit-result': [];
}>();
</script>
