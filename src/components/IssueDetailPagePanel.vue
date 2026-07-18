<template>
  <ContentDetailPagePanel
    :author-name="displayAuthorName"
    :author-photo-url="displayPhotoUrl"
    :initial-tab="initialTab"
    back-label="issue.returnToProposalList"
    :comment-count="mobileCommentCount"
    :content="issue.content"
    details-label="issue.proposalContent"
    :notice-content="issue.status === 'review-rejected' ? issue.review_rejection_reason : issue.result_content"
    :notice-fallback-alt="t('issue.resultImage', { title: issue.title })"
    :notice-markdown="issue.status !== 'review-rejected'"
    :notice-title="issue.status === 'review-rejected' ? 'issue.reasonForRejection' : 'issue.result'"
    :notice-tone="issue.status === 'review-rejected' ? 'error' : 'success'"
    :show-author="showAuthor"
    :title="issue.title"
    @back="emit('back')"
  >
    <template #header>
      <TagBadge class="border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-950/50">
        {{ categoryLabel }}
      </TagBadge>
      <TagBadge elevated class="font-semibold" :class="statusClass">
        {{ statusLabel }}
      </TagBadge>
      <TagBadge
        v-if="issue.support_enabled && issue.support_met_at"
        elevated
        class="bg-success-container font-semibold text-on-success-container"
      >
        <span class="hidden md:inline">{{ t('issue.proposalAuthor') }}</span>
        <span class="md:hidden">{{ t('issue.author') }}</span>
      </TagBadge>
    </template>

    <template #actions="{ compact }">
      <IssueDetailSupportFooter
        :can-manage="issue.canManageIssue"
        :is-admin="isAdmin"
        :compact="compact"
        :current-user-supported="currentUserSupported"
        :issue="issue"
        :operation-time-items="operationTimeItems"
        :status-label="statusLabel"
        :support-closed="supportClosed"
        :support-count="supportCount"
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
        :category="issue.category"
        :compact-header="compactHeader"
        :focus-comment-id="focusCommentId"
        :issue-id="issue.id"
        class="h-full"
        @comment-count-changed="mobileCommentCount = $event"
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
              {{ t('comments.title') }}
            </h4>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 items-center py-2 pr-1">
          <EmptyStatePanel
            class="!px-3 !py-7"
            :title="t('comments.commentsAreCurrentlyDisabled')"
            :description="t('access.privateIssueVisibility')"
            icon="comment"
          />
        </div>
      </section>
    </template>
  </ContentDetailPagePanel>

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

import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import TagBadge from '@/components/ui/atoms/TagBadge.vue';
import EmptyStatePanel from '@/components/ui/molecules/EmptyStatePanel.vue';
import ContentDetailPagePanel from '@/components/ContentDetailPagePanel.vue';
import IssueDetailSupportFooter from '@/components/IssueDetailSupportFooter.vue';
import IssueComments from '@/components/IssueComments.vue';
import { useSession } from '@/composables/useSession';
import { issueAllowsCommentsForStatus } from '@/constants/categories';
import { useI18n } from '@/i18n';

// Shared Moderation Dialogs
import IssueReviewDialog from '@/components/IssueReviewDialog.vue';
import IssueStatusDialog from '@/components/IssueStatusDialog.vue';

const props = withDefaults(
  defineProps<{
    issue: IssueRecord;
    currentUserSupported: boolean;
    focusCommentId?: string;
    supportCount: number;
    supportClosed: boolean;
    initialTab?: 'details' | 'comments';
  }>(),
  {
    focusCommentId: '',
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

const { canManageIssueCategory } = useSession();
const isAdmin = computed(() => canManageIssueCategory(props.issue.category));

const isReviewDialogOpen = ref(false);
const isStatusDialogOpen = ref(false);
const statusDialogInitialAction = ref<'processing' | 'closed'>('processing');
const mobileCommentCount = ref(0);
const { t } = useI18n();

const {
  displayAuthorName,
  displayPhotoUrl,
  derivedStatus,
  categoryLabel,
  statusLabel,
  primaryTimeLabel,
  primaryTimeValueLabel,
  operationTimeItems,
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
  statusDialogInitialAction.value = props.issue.status === 'pending' ? 'processing' : 'closed';
  isStatusDialogOpen.value = true;
}

function handleStatusChanged(updatedIssue: IssueRecord) {
  emit('issue-updated', updatedIssue);
}
</script>
