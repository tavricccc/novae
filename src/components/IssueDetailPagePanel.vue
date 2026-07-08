<template>
  <DetailPageShell
    :initial-tab="initialTab"
    back-label="返回提案列表"
    details-label="提案內容"
    @back="emit('back')"
  >
    <template #header>
      <span class="tag border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-950/50">
        {{ categoryLabel }}
      </span>
      <span class="tag font-semibold shadow-sm" :class="statusClass">
        {{ statusLabel }}
      </span>
      <span
        v-if="issue.support_enabled && issue.support_met_at"
        class="tag border-primary/30 bg-primary-container/50 font-semibold text-on-primary-container shadow-sm"
      >
        <span class="hidden md:inline">已達附議門檻</span>
        <span class="md:hidden">已達門檻</span>
      </span>
    </template>

    <template #details="{ compact, scrollContent }">
      <IssueDetailContent
        :compact="compact"
        :display-author-name="displayAuthorName"
        :display-photo-url="displayPhotoUrl"
        :issue="issue"
        :primary-time-label="primaryTimeLabel"
        :primary-time-value-label="primaryTimeValueLabel"
        :scroll-content="scrollContent"
        :show-author="showAuthor"
      />
    </template>

    <template #actions="{ compact }">
      <IssueDetailSupportFooter
        :can-manage="issue.canManageIssue"
        :is-admin="isAdmin"
        :compact="compact"
        :current-user-supported="currentUserSupported"
        :issue="issue"
        :primary-time-label="primaryTimeLabel"
        :primary-time-short-label="primaryTimeShortLabel"
        :primary-time-value-label="primaryTimeValueLabel"
        :response-deadline-label="responseDeadlineLabel"
        :status-label="statusLabel"
        :support-closed="supportClosed"
        :support-count="supportCount"
        :support-deadline-label="supportDeadlineLabel"
        :support-met-label="supportMetLabel"
        :support-progress-style="supportProgressStyle"
        :support-remaining-label="supportRemainingLabel"
        @content-unavailable="emit('contentUnavailable', $event)"
        @delete="emit('delete')"
        @share="emit('share')"
        @supported="emit('supported', $event)"
        @moderate="handleModerate"
        @edit-result="handleEditResult"
      />
    </template>

    <template #comments="{ compactHeader }">
      <IssueComments
        v-if="commentsEnabled"
        :can-compose="commentsEnabled"
        :compact-header="compactHeader"
        :issue-id="issue.id"
        class="h-full"
        @content-unavailable="emit('contentUnavailable', $event)"
      />
      <section v-else class="flex h-full min-h-0 flex-col">
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
        </div>
        <div class="flex min-h-0 flex-1 items-center py-4 pr-1">
          <EmptyStatePanel
            title="目前不開放留言"
            description="提案完成審核後才會開放留言討論。"
            icon="comment"
          />
        </div>
      </section>
    </template>
  </DetailPageShell>

  <!-- Moderation Dialogs -->
  <IssueReviewDialog
    v-if="isReviewDialogOpen"
    :open="isReviewDialogOpen"
    :issue="issue"
    @success="handleStatusChanged"
    @close="isReviewDialogOpen = false"
  />

  <IssueStatusDialog
    v-if="isStatusDialogOpen"
    :open="isStatusDialogOpen"
    :issue="issue"
    :initial-action="statusDialogInitialAction"
    @success="handleStatusChanged"
    @close="isStatusDialogOpen = false"
  />
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useIssueDisplay } from '@/composables/useIssueDisplay';
import { useStatusStyling } from '@/composables/useStatusStyling';
import { getSupportProgressPercent, getSupportRemainingLabel } from '@/lib/issue-status';
import type { IssueRecord } from '@/types';

import DetailPageShell from '@/components/ui/DetailPageShell.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import IssueDetailContent from '@/components/IssueDetailContent.vue';
import IssueDetailSupportFooter from '@/components/IssueDetailSupportFooter.vue';
import IssueComments from '@/components/IssueComments.vue';
import { useSession } from '@/composables/useSession';
import { issueAllowsCommentsForStatus } from '@/constants/categories';

// Shared Moderation Dialogs
import IssueReviewDialog from '@/components/IssueReviewDialog.vue';
import IssueStatusDialog from '@/components/IssueStatusDialog.vue';

const props = withDefaults(
  defineProps<{
    issue: IssueRecord;
    currentUserSupported: boolean;
    supportCount: number;
    supportClosed: boolean;
    initialTab?: 'details' | 'comments';
  }>(),
  {
    initialTab: 'details',
  }
);

const emit = defineEmits<{
  contentUnavailable: [issueId: string];
  back: [];
  delete: [];
  'issue-updated': [issue: IssueRecord];
  share: [];
  supported: [payload: { supported: boolean; supportCount: number }];
}>();

const { isAdmin } = useSession();

const isReviewDialogOpen = ref(false);
const isStatusDialogOpen = ref(false);
const statusDialogInitialAction = ref<'processing' | 'closed'>('processing');

const {
  displayAuthorName,
  displayPhotoUrl,
  derivedStatus,
  categoryLabel,
  statusLabel,
  primaryTimeLabel,
  primaryTimeShortLabel,
  primaryTimeValueLabel,
  supportDeadlineLabel,
  responseDeadlineLabel,
  supportMetLabel,
  remainingDays,
} = useIssueDisplay(toRef(props, 'issue'));

const { statusClass } = useStatusStyling(derivedStatus, 'dialog');

const supportProgressStyle = computed(() => {
  const progress = getSupportProgressPercent(props.supportCount, props.issue.support_goal);
  return { width: `${progress}%` };
});

const showAuthor = computed(() => props.issue.canViewAuthor);

const supportRemainingLabel = computed(() => getSupportRemainingLabel(remainingDays.value));
const commentsEnabled = computed(() => issueAllowsCommentsForStatus(props.issue.category, props.issue.status));

function handleModerate() {
  isReviewDialogOpen.value = true;
}

function handleEditResult() {
  statusDialogInitialAction.value = props.issue.status === 'completed' || props.issue.status === 'infeasible' ? 'closed' : 'processing';
  isStatusDialogOpen.value = true;
}

function handleStatusChanged(updatedIssue: IssueRecord) {
  emit('issue-updated', updatedIssue);
}
</script>
