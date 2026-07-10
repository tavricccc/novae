<template>
  <div class="min-h-0">
    <PageLoadFailure
      v-if="sessionLoadingHasProblem"
      :title="sessionProblemTitle"
      :description="sessionProblemDescription"
      :retry-disabled="!sessionOnline"
      @retry="reloadPage"
    />

    <div v-else-if="sessionLoading || routeIssueLoading" class="flex min-h-[50dvh] items-center justify-center" aria-label="正在載入提案" aria-busy="true">
      <LoadingSpinner :size="8" />
    </div>

    <div v-else-if="!isAllowedUser" class="sr-only" role="status">正在前往登入頁</div>

    <IssueDetailPagePanel
      v-else-if="routeIssue"
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

    <ConfirmDialog
      :open="isDeleteDialogOpen"
      title="確定要刪除這筆提案嗎？"
      message="刪除後這筆提案將無法復原。"
      confirm-label="確認刪除"
      busy-label="刪除中..."
      :busy="isDeleting"
      @cancel="closeDeleteDialog"
      @confirm="performRouteIssueDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import IssueDetailPagePanel from '@/components/IssueDetailPagePanel.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import { useDeleteIssue } from '@/composables/useDeleteIssue';
import { useIssueRouteDetail } from '@/composables/useIssueRouteDetail';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { useSession } from '@/composables/useSession';
import { useShareUrl } from '@/composables/useShareUrl';
import { useToast } from '@/composables/useToast';
import { normalizeIssueRouteFilterParam } from '@/constants/categories';
import { resetAppConnection } from '@/lib/reconnect';

const route = useRoute();
const router = useRouter();
const { initialized, isAllowedUser, loading, mySupportedIssueIds } = useSession();
const { copyShareUrl } = useShareUrl();
const { showToast } = useToast();

const sessionLoading = computed(() => loading.value || !initialized.value);
const canLoadIssue = computed(() => initialized.value && isAllowedUser.value);
const {
  hasProblem: sessionLoadingHasProblem,
  isOnline: sessionOnline,
  problemDescription: sessionProblemDescription,
  problemTitle: sessionProblemTitle,
} = useLoadingTimeout(sessionLoading, 5_000);

const {
  routeIssue,
  routeIssueLoading,
  routeIssueSupportClosed,
  closeRouteIssue,
  patchRouteIssue,
  updateRouteIssueSupport,
} = useIssueRouteDetail(mySupportedIssueIds, undefined, canLoadIssue);

const routeIssueId = computed(() => routeIssue.value?.id ?? '');
const {
  isDeleteDialogOpen,
  isDeleting,
  actionError,
  confirmDelete: openDeleteDialog,
  closeDeleteDialog,
  performDelete,
} = useDeleteIssue(routeIssueId);

const initialTab = computed(() => route.query.tab === 'comments' ? 'comments' : 'details');
const focusCommentId = computed(() => {
  const value = route.query.comment;
  return typeof value === 'string' ? value : '';
});

function goBackToIssueList() {
  closeRouteIssue();
}

function copyRouteIssueUrl() {
  if (!routeIssue.value) return;
  const href = router.resolve({
    name: 'issue-detail',
    params: {
      filter: normalizeIssueRouteFilterParam(route.params.filter),
      issueId: routeIssue.value.id,
    },
  }).href;
  copyShareUrl(new URL(href, window.location.origin).toString());
}

async function performRouteIssueDelete() {
  const deletedIssueId = await performDelete();
  if (actionError.value) {
    showToast(actionError.value, 'error');
    return;
  }

  if (deletedIssueId) {
    showToast('提案已刪除。', 'success');
  }
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
