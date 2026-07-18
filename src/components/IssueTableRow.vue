<template>
  <ContentCardShell
    :author-name="displayAuthorName"
    :author-photo-url="displayPhotoUrl"
    :highlight-query="highlightQuery"
    :show-author="issue.canViewAuthor"
    :status-class="statusClass"
    :status-label="statusLabel"
    :time-label="primaryTimeValueLabel"
    :title="issue.title"
    @open="openDetails()"
  >
    <template v-if="isAdmin" #admin>
      <IssueAdminMenu
        :issue="issue"
        :compact="true"
        class="!space-y-0"
        @message="(msg) => showActionFeedback(msg, 'success')"
        @error="(err) => showActionFeedback(err, 'error')"
        @status-changed="emit('issue-updated', $event)"
        @delete="confirmDelete"
      />
    </template>

    <template #supplement>
      <SurfacePanel v-if="issue.support_enabled" variant="inset" class="mt-4 px-3 py-2.5">
        <div class="flex items-center justify-between gap-3 text-xs">
          <span class="font-semibold tabular-nums text-ink-700 dark:text-ink-300">
            {{ t('issue.countGoalSupports', { count: supportCount, goal: issue.support_goal ?? 0 }) }}
          </span>
          <span v-if="supportRemainingLabel" class="text-ink-400 dark:text-ink-500">
            {{ supportRemainingLabel }}
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-200/80 dark:bg-ink-700" aria-hidden="true">
          <div
            class="h-full rounded-full bg-ink-900 transition-all duration-500 dark:bg-ink-100"
            :style="supportProgressStyle"
          ></div>
        </div>
      </SurfacePanel>
      <p v-else class="mt-4 text-xs text-ink-400 dark:text-ink-500">{{ t('issue.thisProposalDoesNotRequireSupport') }}</p>
    </template>

    <template #actions>
      <AppButton
        variant="toolbar"
        class="h-8 w-8 rounded-full p-0"
        :title="t('comments.viewComments')"
        :aria-label="t('comments.viewComments')"
        @click.stop="openDetails('comments')"
      >
        <AppIcon name="comment" />
      </AppButton>
      <VoteButtons
        v-if="issue.support_enabled"
        :author-fixed="issue.isOwnIssue"
        :issue-id="issue.id"
        :current-user-supported="currentUserSupported"
        :support-count="supportCount"
        :support-closed="supportClosed"
        :status-label="statusLabel"
        :compact="true"
        @supported="handleSupport"
      />
    </template>

    <template #dialogs>
      <ConfirmDialog
        :open="isDeleteDialogOpen"
        title="issue.areYouSureYouWantToDeleteThisProposal"
        message="issue.onceDeletedThisProposalCannotBeRestored"
        confirm-label="comments.confirmDeletion"
        :busy="isDeleting"
        @cancel="isDeleteDialogOpen = false"
        @confirm="performDelete"
      />
    </template>
  </ContentCardShell>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import IssueAdminMenu from '@/components/IssueAdminMenu.vue';
import VoteButtons from '@/components/VoteButtons.vue';
import AppIcon from '@/components/ui/atoms/AppIcon.vue';
import AppButton from '@/components/ui/atoms/AppButton.vue';
import ContentCardShell from '@/components/ui/organisms/ContentCardShell.vue';
import SurfacePanel from '@/components/ui/molecules/SurfacePanel.vue';
import { useIssueItemController } from '@/composables/useIssueItemController';
import type { IssueRecord } from '@/types';
import { useI18n } from '@/i18n';

const props = withDefaults(defineProps<{
  issue: IssueRecord;
  highlightQuery?: string;
}>(), {
  highlightQuery: '',
});

const emit = defineEmits<{
  'support-changed': [payload: { issueId: string; supported: boolean; supportCount: number }];
  'open-details': [payload: { issue: IssueRecord; initialTab: 'details' | 'comments' }];
  'issue-updated': [issue: IssueRecord];
  'issue-deleted': [issueId: string];
}>();
const { t } = useI18n();

const {
  displayAuthorName,
  displayPhotoUrl,
  statusLabel,
  primaryTimeValueLabel,
  isAdmin,
  currentUserSupported,
  supportCount,
  statusClass,
  supportClosed,
  supportProgressStyle,
  supportRemainingLabel,
  isDeleteDialogOpen,
  isDeleting,
  handleSupport,
  openDetails,
  confirmDelete,
  performDelete,
  showActionFeedback,
} = useIssueItemController(
  toRef(props, 'issue'),
  'table-row',
  (payload) => emit('support-changed', payload),
  (payload) => emit('open-details', payload),
  (issue) => emit('issue-updated', issue),
  (issueId) => emit('issue-deleted', issueId),
);
</script>
