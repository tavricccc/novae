<template>
  <RoutePageFrame as="div" bottom-safe layout="fill">
    <DetailRouteState
      :allowed="isAllowedUser"
      :loading="sessionLoading || routeIssueLoading"
      loading-label="issue.loadingProposals"
      :problem="sessionLoadingHasProblem"
      :problem-title="sessionProblemTitle"
      :problem-description="sessionProblemDescription"
      :problem-retry-disabled="!sessionOnline"
      @retry-problem="reloadPage"
    >
      <IssueDetailPagePanel
        v-if="routeIssue"
        :issue="routeIssue"
        :current-user-supported="Boolean(routeIssue.currentUserSupported)"
        :support-count="routeIssue.support_count"
        :support-closed="routeIssueSupportClosed"
        :initial-tab="initialTab"
        :focus-comment-id="focusCommentId"
        @back="goBackToIssueList"
        @content-unavailable="handleRouteIssueUnavailable"
        @delete="openDeleteDialog"
        @issue-updated="patchRouteIssue"
        @share="copyRouteIssueUrl"
        @supported="handleRouteIssueSupport"
      />
    </DetailRouteState>

    <ConfirmDialog
      :open="isDeleteDialogOpen"
      title="issue.areYouSureYouWantToDeleteThisProposal"
      message="issue.onceDeletedThisProposalCannotBeRestored"
      confirm-label="comments.confirmDeletion"
      :busy="isDeleting"
      @cancel="closeDeleteDialog"
      @confirm="performRouteIssueDelete"
    />
  </RoutePageFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import IssueDetailPagePanel from '@/components/IssueDetailPagePanel.vue';
import DetailRouteState from '@/components/ui/organisms/DetailRouteState.vue';
import RoutePageFrame from '@/components/ui/organisms/RoutePageFrame.vue';
import { useDeleteIssue } from '@/composables/useDeleteIssue';
import { useAuthenticatedDetailState } from '@/composables/useAuthenticatedDetailState';
import { useDetailRouteQuery } from '@/composables/useDetailRouteQuery';
import { useIssueRouteDetail } from '@/composables/useIssueRouteDetail';
import { useSession } from '@/composables/useSession';
import { useShareUrl } from '@/composables/useShareUrl';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { normalizeIssueRouteFilterParam } from '@/constants/categories';
import { resetAppConnection } from '@/lib/reconnect';

const route = useRoute();
const {
  canLoad,
  isAllowedUser,
  sessionLoading,
  sessionLoadingHasProblem,
  sessionOnline,
  sessionProblemDescription,
  sessionProblemTitle,
} = useAuthenticatedDetailState();
const { mySupportedIssueIds } = useSession();
const { copyRouteUrl } = useShareUrl();
const { show } = useActionFeedback();

const {
  routeIssue,
  routeIssueLoading,
  routeIssueSupportClosed,
  closeRouteIssue,
  patchRouteIssue,
  updateRouteIssueSupport,
} = useIssueRouteDetail(mySupportedIssueIds, undefined, canLoad);

const routeIssueId = computed(() => routeIssue.value?.id ?? '');
const {
  isDeleteDialogOpen,
  isDeleting,
  actionError,
  confirmDelete: openDeleteDialog,
  closeDeleteDialog,
  performDelete,
} = useDeleteIssue(routeIssueId);

const { focusCommentId, initialTab } = useDetailRouteQuery();

function goBackToIssueList() {
  closeRouteIssue();
}

function copyRouteIssueUrl() {
  if (!routeIssue.value) return;
  void copyRouteUrl({
    name: 'issue-detail',
    params: {
      filter: normalizeIssueRouteFilterParam(route.params.filter),
      issueId: routeIssue.value.id,
    },
  });
}

async function performRouteIssueDelete() {
  const deletedIssueId = await performDelete();
  if (actionError.value) {
    return;
  }

  if (!deletedIssueId) return;
  closeDeleteDialog();
  closeRouteIssue();
}

function handleRouteIssueSupport(payload: { supported: boolean; supportCount: number }) {
  updateRouteIssueSupport(payload.supported, payload.supportCount);
}

function handleRouteIssueUnavailable() {
  closeRouteIssue();
}

async function reloadPage() {
  await resetAppConnection();
  window.location.reload();
}
</script>
