<template>
  <DetailActionGroup
    :compact="compact"
    delete-title="issue.admin.delete"
    :operation-time-items="operationTimeItems"
    :separate-operation-times="issue.support_enabled"
    :show-delete="canManage"
    @delete="emit('delete')"
    @share="emit('share')"
  >
    <template v-if="issue.support_enabled" #header>
      <div class="space-y-2">
        <div class="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
          <span class="text-sm font-bold text-ink-900 dark:text-ink-50">
            {{ t('issue.support.progress', { count: supportCount, goal: issue.support_goal ?? 0 }) }}
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
    </template>

    <template v-if="issue.support_enabled" #primary>
      <VoteButtons
        class="shrink-0"
        :issue-id="issue.id"
        :current-user-supported="currentUserSupported"
        :support-count="supportCount"
        :support-closed="supportClosed"
        :status-label="statusLabel"
        :compact="compact"
        :author-fixed="issue.isOwnIssue"
        @content-unavailable="emit('contentUnavailable', $event)"
        @supported="emit('supported', $event)"
      />
    </template>

    <DetailActionButton
      v-if="isAdmin && !isClosed"
      :label="isUnderReview ? 'issue.review' : 'issue.changeStatusResult'"
      :compact="compact"
      :title="isUnderReview ? 'issue.review' : 'issue.changeStatusResult'"
      :aria-label="isUnderReview ? 'issue.review' : 'issue.changeStatusResult'"
      @click="isUnderReview ? emit('moderate') : emit('edit-result')"
    >
      <AppIcon name="edit" />
    </DetailActionButton>
  </DetailActionGroup>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import DetailActionButton from '@/components/ui/molecules/DetailActionButton.vue';
import DetailActionGroup from '@/components/ui/molecules/DetailActionGroup.vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import VoteButtons from '@/components/VoteButtons.vue';
import type { IssueOperationTimeItem, IssueRecord } from '@/types';
import { useI18n } from '@/i18n';

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
const { t } = useI18n();

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
